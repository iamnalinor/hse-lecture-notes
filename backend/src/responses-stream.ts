import { ResponseEofError } from "./socks5-fetch";
import type { CodexInputItem, LlmRoundResult, RoundTokenUsage } from "./types";

export class LlmUpstreamError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ResponsesSseEvent {
  type?: string;
  code?: string;
  message?: string;
  delta?: string;
  item?: Record<string, unknown>;
  response?: {
    status?: string;
    output?: Array<Record<string, unknown>>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: {
        cached_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_write_tokens?: number;
      };
    };
    error?: { code?: string; message?: string };
  };
  error?: { code?: string; message?: string };
}

function extractUsage(raw: ResponsesSseEvent["response"]): RoundTokenUsage | null {
  const u = raw?.usage;
  if (!u || typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") {
    return null;
  }
  const details = u.input_tokens_details ?? {};
  return {
    inputTokens: u.input_tokens,
    cachedTokens: typeof details.cached_tokens === "number" ? details.cached_tokens : 0,
    cacheWriteTokens:
      typeof details.cache_creation_input_tokens === "number"
        ? details.cache_creation_input_tokens
        : typeof details.cache_write_tokens === "number"
          ? details.cache_write_tokens
          : 0,
    outputTokens: u.output_tokens,
  };
}

function parseOutputItems(
  rawItems: Array<Record<string, unknown>>,
): {
  outputItems: CodexInputItem[];
  functionCalls: LlmRoundResult["functionCalls"];
  fallbackText: string;
} {
  const outputItems: CodexInputItem[] = [];
  const functionCalls: LlmRoundResult["functionCalls"] = [];
  let fallbackText = "";

  for (const item of rawItems) {
    const type = item.type;
    if (type === "reasoning") {
      outputItems.push(item as CodexInputItem);
    } else if (type === "function_call") {
      const callId = String(item.call_id ?? "");
      const name = String(item.name ?? "");
      const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {});
      if (callId && name) {
        const fcItem: CodexInputItem = {
          type: "function_call",
          ...(typeof item.id === "string" ? { id: item.id } : {}),
          call_id: callId,
          name,
          arguments: args,
        };
        outputItems.push(fcItem);
        functionCalls.push({
          id: typeof item.id === "string" ? item.id : undefined,
          callId,
          name,
          arguments: args,
        });
      }
    } else if (type === "message") {
      const content = Array.isArray(item.content) ? item.content : [];
      const textParts: Array<{ type: "output_text"; text: string }> = [];
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          const t = (part as { text: string }).text;
          fallbackText += t;
          textParts.push({ type: "output_text", text: t });
        }
      }
      if (textParts.length > 0) {
        outputItems.push({
          type: "message",
          role: "assistant",
          content: textParts,
        });
      }
    }
  }

  return { outputItems, functionCalls, fallbackText };
}

/**
 * Line-buffered SSE parser shared by Codex and OpenAI Responses APIs.
 * Strictly requires terminal `response.completed` to mark `completed: true`.
 */
export async function parseResponsesSseStream(
  body: ReadableStream<Uint8Array>,
  maxResponseChars: number,
  onDelta: (delta: string) => void,
  onTruncateAbort?: () => void,
  upstream: "codex" | "openai" = "codex",
): Promise<LlmRoundResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let sawResponseEvent = false;
  let truncated = false;
  let completed = false;
  let finalStatus = "incomplete";
  let usage: RoundTokenUsage | null = null;
  const streamedItems: Array<Record<string, unknown>> = [];
  let completedResponseOutput: Array<Record<string, unknown>> | null = null;

  const processDataLine = (rawData: string): void => {
    const trimmed = rawData.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    let evt: ResponsesSseEvent;
    try {
      evt = JSON.parse(trimmed) as ResponsesSseEvent;
    } catch {
      return;
    }

    if (evt.type?.startsWith("response.")) sawResponseEvent = true;

    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
      if (truncated) return;
      const remaining = maxResponseChars - streamedText.length;
      if (remaining <= 0) {
        truncated = true;
        onTruncateAbort?.();
        return;
      }
      const chunk = evt.delta.length > remaining ? evt.delta.slice(0, remaining) : evt.delta;
      streamedText += chunk;
      onDelta(chunk);
      if (streamedText.length >= maxResponseChars) {
        truncated = true;
        onTruncateAbort?.();
      }
      return;
    }

    if (evt.type === "response.output_item.done" && evt.item && typeof evt.item === "object") {
      streamedItems.push(evt.item);
      return;
    }

    if (evt.type === "response.completed" || evt.type === "response.incomplete") {
      completed = evt.type === "response.completed";
      finalStatus = evt.response?.status ?? (completed ? "completed" : "incomplete");
      usage = extractUsage(evt.response);
      if (Array.isArray(evt.response?.output)) {
        completedResponseOutput = evt.response.output;
      }
      return;
    }

    if (evt.type === "response.failed" || evt.type === "error") {
      const errObj = evt.response?.error ?? evt.error ?? evt;
      throw new LlmUpstreamError(
        502,
        errObj?.code ?? `${upstream}_response_failed`,
        errObj?.message ?? `${upstream === "codex" ? "Codex" : "OpenAI"} response failed`,
      );
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read().catch((err: unknown) => {
        if (!sawResponseEvent && !buffer.includes("response.")) throw new ResponseEofError("before_event");
        throw err;
      });
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);
        if (/^event:\s*response\./.test(line)) sawResponseEvent = true;
        if (line.startsWith("data:")) {
          processDataLine(line.slice(5));
        }
        if (truncated) break;
        newlineIdx = buffer.indexOf("\n");
      }
      if (truncated) break;
    }

    // Flush trailing buffered line
    buffer += decoder.decode();
    if (!truncated && buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (/^event:\s*response\./.test(line)) sawResponseEvent = true;
        if (line.startsWith("data:")) {
          processDataLine(line.slice(5));
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel errors on aborted streams
    }
  }

  if (!sawResponseEvent && !buffer.includes("response.")) throw new ResponseEofError("before_event");

  const rawItems = completedResponseOutput ?? streamedItems;
  const { outputItems, functionCalls, fallbackText } = parseOutputItems(rawItems);
  const text = streamedText || fallbackText.slice(0, maxResponseChars);

  return {
    completed: completed || truncated,
    status: truncated ? "truncated" : finalStatus,
    text,
    truncated,
    outputItems,
    functionCalls,
    usage,
  };
}
