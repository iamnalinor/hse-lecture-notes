import { MAX_METADATA_ARGUMENTS_CHARS } from "../chat/metadata-tools";
import { ResponseEofError } from "./socks5-fetch";
import type { CodexInputItem, LlmRoundResult, RoundTokenUsage } from "../types";

export class LlmUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
type Raw = Record<string, unknown>;
const object = (v: unknown): Raw | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
function extractUsage(response: Raw | null): RoundTokenUsage | null {
  const u = object(response?.usage),
    details = object(u?.input_tokens_details);
  if (!u) return null;
  const values = [
    u.input_tokens,
    details?.cached_tokens ?? 0,
    details?.cache_creation_input_tokens ?? details?.cache_write_tokens ?? 0,
    u.output_tokens,
  ];
  if (!values.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
  const [inputTokens, cachedTokens, cacheWriteTokens, outputTokens] = values as number[];
  if (cachedTokens! + cacheWriteTokens! > inputTokens!) return null;
  return {
    inputTokens: inputTokens!,
    cachedTokens: cachedTokens!,
    cacheWriteTokens: cacheWriteTokens!,
    outputTokens: outputTokens!,
  };
}
function parseOutput(rawItems: Raw[], strict: boolean) {
  const outputItems: CodexInputItem[] = [],
    functionCalls: LlmRoundResult["functionCalls"] = [],
    violations: string[] = [];
  const ids = new Set<string>();
  let text = "",
    refusal: string | undefined;
  for (const item of rawItems) {
    if (item.type === "reasoning") {
      outputItems.push(item as CodexInputItem);
      continue;
    }
    if (item.type === "function_call") {
      if (
        typeof item.call_id !== "string" ||
        !item.call_id ||
        ids.has(item.call_id) ||
        typeof item.name !== "string" ||
        !item.name ||
        typeof item.arguments !== "string"
      ) {
        violations.push("invalid_function_call");
        continue;
      }
      ids.add(item.call_id);
      if (item.name === "set_topic" && item.arguments.length > MAX_METADATA_ARGUMENTS_CHARS)
        violations.push("metadata_too_large");
      const fc = {
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        callId: item.call_id,
        name: item.name,
        arguments:
          item.name === "suggest_reply"
            ? item.arguments.slice(0, MAX_METADATA_ARGUMENTS_CHARS + 1)
            : item.arguments,
      };
      functionCalls.push(fc);
      outputItems.push({
        type: "function_call",
        ...(fc.id ? { id: fc.id } : {}),
        call_id: fc.callId,
        name: fc.name,
        arguments: fc.arguments,
      });
    } else if (item.type === "message") {
      if (strict && item.role !== "assistant") {
        violations.push("invalid_output_role");
        continue;
      }
      const parts: Array<{ type: "output_text"; text: string }> = [];
      if (!Array.isArray(item.content)) {
        violations.push("invalid_message");
        continue;
      }
      for (const value of item.content) {
        const part = object(value);
        if (part?.type === "refusal" && typeof part.refusal === "string") {
          refusal = part.refusal;
          continue;
        }
        if (part?.type !== "output_text" || typeof part.text !== "string") {
          violations.push("invalid_content");
          continue;
        }
        parts.push({ type: "output_text", text: part.text });
      }
      if (parts.length) {
        const messageText = parts.map((p) => p.text).join("");
        if (messageText) text += (text ? "\n\n" : "") + messageText;
        outputItems.push({
          type: "message",
          role: "assistant",
          ...(typeof item.id === "string" ? { id: item.id } : {}),
          ...(typeof item.phase === "string" ? { phase: item.phase } : {}),
          content: parts,
        });
      }
    } else violations.push("unknown_output_item");
  }
  return { outputItems, functionCalls, violations, text, refusal };
}

/** Item-aware SSE gate; full terminal output is validated independently of deltas. */
export async function parseResponsesSseStream(
  body: ReadableStream<Uint8Array>,
  maxResponseChars: number,
  onDelta: (delta: string) => void,
  onTruncateAbort?: () => void,
  upstream: "codex" | "openai" = "codex",
  options: { enforceProtocol?: boolean; hideText?: boolean } = {},
): Promise<LlmRoundResult> {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    streamedText = "",
    observedOutputChars = 0,
    sawEvent = false,
    truncated = false,
    terminal = false,
    status = "incomplete",
    completed = false;
  let usage: RoundTokenUsage | null = null,
    responseId: string | undefined,
    finalOutput: Raw[] | null = null;
  const items = new Map<number, Raw>(),
    doneItems: Raw[] = [],
    violations: string[] = [];
  const argumentLengths = new Map<number, number>();
  let lastTextItem: Raw | undefined;
  const strict = options.enforceProtocol ?? false;
  const emit = (text: string) => {
    if (truncated) return;
    const remaining = maxResponseChars - observedOutputChars;
    observedOutputChars += Math.min(text.length, Math.max(0, remaining));
    if (text.length > remaining) {
      if (!options.hideText) {
        streamedText += text.slice(0, Math.max(0, remaining));
        onDelta(text.slice(0, Math.max(0, remaining)));
      }
      truncated = true;
      onTruncateAbort?.();
    } else if (!options.hideText) {
      streamedText += text;
      onDelta(text);
    }
  };
  function process(raw: string) {
    if (terminal || truncated || !raw.trim() || raw.trim() === "[DONE]") return;
    let evt: Raw;
    try {
      const parsed = object(JSON.parse(raw));
      if (!parsed) {
        violations.push("invalid_event");
        return;
      }
      evt = parsed;
    } catch {
      violations.push("invalid_event_json");
      return;
    }
    const type = typeof evt.type === "string" ? evt.type : "";
    if (type.startsWith("response.") || type === "error") sawEvent = true;
    const index = typeof evt.output_index === "number" ? evt.output_index : undefined;
    const item = object(evt.item);
    if (type === "response.output_item.added" && item) {
      if (index !== undefined) items.set(index, item);
    } else if (
      type === "response.function_call_arguments.delta" &&
      typeof evt.delta === "string" &&
      index !== undefined
    ) {
      const n = (argumentLengths.get(index) ?? 0) + evt.delta.length;
      argumentLengths.set(index, n);
      if (items.get(index)?.name === "set_topic" && n > MAX_METADATA_ARGUMENTS_CHARS) {
        violations.push("metadata_too_large");
        truncated = true;
        onTruncateAbort?.();
      }
    } else if (type === "response.output_text.delta" && typeof evt.delta === "string") {
      const source =
        index !== undefined
          ? items.get(index)
          : [...items.values()].find((v) => v.id === evt.item_id);
      if (strict && (source?.type !== "message" || source.role !== "assistant")) {
        violations.push("unidentified_text");
        return;
      }
      if (source && source !== lastTextItem && streamedText) emit("\n\n");
      lastTextItem = source;
      emit(evt.delta);
    } else if (type === "response.output_item.done" && item) {
      doneItems.push(item);
    } else if (
      ["response.completed", "response.incomplete", "response.failed", "error"].includes(type)
    ) {
      terminal = true;
      const response = object(evt.response);
      responseId = typeof response?.id === "string" ? response.id : undefined;
      usage = extractUsage(response);
      status =
        typeof response?.status === "string" ? response.status : type.slice("response.".length);
      completed = type === "response.completed" && status === "completed";
      if (type === "response.completed" && status !== "completed")
        violations.push("terminal_mismatch");
      if (Array.isArray(response?.output)) {
        if (response.output.some((value) => object(value) === null))
          violations.push("invalid_output_item");
        finalOutput = response.output.map(object).filter((v): v is Raw => v !== null);
      } else if (response?.output !== undefined) violations.push("invalid_output");
      if (type === "response.failed" || type === "error") {
        status = "failed";
        completed = false;
      }
    }
  }
  let transportFailed = false;
  try {
    while (!terminal && !truncated) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (error) {
        if (!sawEvent) throw new ResponseEofError("before_event");
        transportFailed = true;
        break;
      }
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 1_000_000) {
        violations.push("event_too_large");
        truncated = true;
        onTruncateAbort?.();
        break;
      }
      let i = buffer.indexOf("\n");
      while (i >= 0 && !terminal && !truncated) {
        const line = buffer.slice(0, i).replace(/\r$/u, "");
        buffer = buffer.slice(i + 1);
        if (line.startsWith("event: response.")) sawEvent = true;
        if (line.startsWith("data:")) process(line.slice(5));
        i = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (!terminal && !truncated)
      for (const line of buffer.split(/\r?\n/u))
        if (line.startsWith("data:")) process(line.slice(5));
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!sawEvent) throw new ResponseEofError("before_event");
  const parsed = parseOutput(finalOutput ?? doneItems, strict);
  violations.push(...parsed.violations);
  if (parsed.text.length > maxResponseChars) truncated = true;
  observedOutputChars = Math.max(
    observedOutputChars,
    Math.min(parsed.text.length, maxResponseChars),
  );
  let text = streamedText || (options.hideText ? "" : parsed.text.slice(0, maxResponseChars));
  if (parsed.refusal && !text && !options.hideText)
    text = parsed.refusal.slice(0, maxResponseChars);
  return {
    completed: completed && !truncated && !transportFailed,
    status: truncated ? "truncated" : status,
    text,
    truncated,
    observedOutputChars,
    outputItems: parsed.outputItems,
    functionCalls: parsed.functionCalls,
    usage,
    responseId,
    protocolViolations: [...new Set(violations)],
    ...(parsed.refusal ? { refusal: parsed.refusal } : {}),
  };
}
