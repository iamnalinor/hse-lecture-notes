import { getValidCodexCredentials, type CodexCredentialsPayload } from "./codex-auth";
import type { TrackedD1 } from "./db";
import { fetchViaProxy, ProxyConnectError } from "./socks5-fetch";
import type {
  CodexInputItem,
  Env,
  FetchLike,
  LlmProvider,
  LlmRoundRequest,
  LlmRoundResult,
  RoundTokenUsage,
} from "./types";

export class CodexUpstreamError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface CodexSseEvent {
  type?: string;
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

function extractUsage(raw: CodexSseEvent["response"]): RoundTokenUsage | null {
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
 * Line-buffered SSE parser for Codex Responses API.
 * Strictly requires terminal `response.completed` to mark `completed: true`.
 */
export async function parseCodexSseStream(
  body: ReadableStream<Uint8Array>,
  maxResponseChars: number,
  onDelta: (delta: string) => void,
  onTruncateAbort?: () => void,
): Promise<LlmRoundResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let truncated = false;
  let completed = false;
  let finalStatus = "incomplete";
  let usage: RoundTokenUsage | null = null;
  const streamedItems: Array<Record<string, unknown>> = [];
  let completedResponseOutput: Array<Record<string, unknown>> | null = null;

  const processDataLine = (rawData: string): void => {
    const trimmed = rawData.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    let evt: CodexSseEvent;
    try {
      evt = JSON.parse(trimmed) as CodexSseEvent;
    } catch {
      return;
    }

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

    if (evt.type === "response.completed") {
      completed = true;
      finalStatus = evt.response?.status ?? "completed";
      usage = extractUsage(evt.response);
      if (Array.isArray(evt.response?.output)) {
        completedResponseOutput = evt.response.output;
      }
      return;
    }

    if (evt.type === "response.failed" || evt.type === "error") {
      const errObj = evt.response?.error ?? evt.error;
      throw new CodexUpstreamError(
        502,
        errObj?.code ?? "codex_response_failed",
        errObj?.message ?? "Codex response failed",
      );
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);
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

export class CodexResponsesProvider implements LlmProvider {
  private readonly env: Pick<
    Env,
    | "CODEX_RESPONSES_URL"
    | "CODEX_TOKEN_URL"
    | "CODEX_OAUTH_CLIENT_ID"
    | "CODEX_CREDENTIALS_ENCRYPTION_KEY"
    | "CODEX_PROXY_URL"
    | "TELEGRAM_BOT_TOKEN"
    | "OWNER_TELEGRAM_ID"
  >;
  private readonly db: TrackedD1;
  private readonly fetchImpl: FetchLike;
  private readonly authFetchImpl: FetchLike;
  private readonly getCredentialsImpl?: (forceRefresh: boolean) => Promise<CodexCredentialsPayload>;

  constructor(
    env: Pick<
      Env,
      | "CODEX_RESPONSES_URL"
      | "CODEX_TOKEN_URL"
      | "CODEX_OAUTH_CLIENT_ID"
      | "CODEX_CREDENTIALS_ENCRYPTION_KEY"
      | "CODEX_PROXY_URL"
      | "TELEGRAM_BOT_TOKEN"
      | "OWNER_TELEGRAM_ID"
    >,
    db: TrackedD1,
    options: {
      fetchImpl?: FetchLike;
      getCredentialsImpl?: (forceRefresh: boolean) => Promise<CodexCredentialsPayload>;
    } = {},
  ) {
    this.env = env;
    this.db = db;
    const proxyUrl = env.CODEX_PROXY_URL?.trim();
    const directFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
    this.authFetchImpl = options.fetchImpl ?? directFetch;
    this.fetchImpl =
      options.fetchImpl ??
      (proxyUrl ? (input, init) => fetchViaProxy(proxyUrl, input, init) : directFetch);
    this.getCredentialsImpl = options.getCredentialsImpl;
  }

  private async loadCreds(forceRefresh: boolean): Promise<CodexCredentialsPayload> {
    if (this.getCredentialsImpl) return this.getCredentialsImpl(forceRefresh);
    return getValidCodexCredentials(this.env, this.db, {
      forceRefresh,
      fetchImpl: this.authFetchImpl,
    });
  }

  async runRound(req: LlmRoundRequest): Promise<LlmRoundResult> {
    let creds = await this.loadCreds(false);

    let retriedProxy = false;
    let refreshedAuth = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      req.signal.throwIfAborted();
      const localAbort = new AbortController();
      const onParentAbort = () => localAbort.abort(req.signal.reason);
      if (req.signal.aborted) {
        localAbort.abort(req.signal.reason);
      } else {
        req.signal.addEventListener("abort", onParentAbort, { once: true });
      }

      try {
        // IMPORTANT: never send `max_output_tokens` to chatgpt.com/backend-api/codex/responses
        const payload = {
          model: req.model,
          reasoning: { effort: req.effort },
          instructions: req.instructions,
          input: req.input,
          tools: req.tools,
          parallel_tool_calls: true,
          store: false,
          stream: true,
        };

        const headers: Record<string, string> = {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": "codex_cli_rs/0.114.0 (Linux; x86_64)",
          originator: "codex_cli_rs",
        };
        if (creds.accountId) {
          headers["ChatGPT-Account-Id"] = creds.accountId;
        }

        let resp: Response;
        try {
          resp = await this.fetchImpl(this.env.CODEX_RESPONSES_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: localAbort.signal,
          });
        } catch (fetchErr) {
          if (fetchErr instanceof ProxyConnectError) {
            const temporary = fetchErr.reply === null || [1, 3, 4, 5, 6].includes(fetchErr.reply);
            if (!temporary || attempt >= 2 || retriedProxy || req.signal.aborted) throw fetchErr;
            retriedProxy = true;
            await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));
            continue;
          }
          throw fetchErr;
        }

        if (resp.status === 401 && !refreshedAuth && attempt < 2) {
          refreshedAuth = true;
          creds = await this.loadCreds(true);
          continue;
        }

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new CodexUpstreamError(
            resp.status,
            resp.status === 429 ? "codex_rate_limited" : "codex_upstream_error",
            `Codex API HTTP ${resp.status}: ${text.slice(0, 300)}`,
          );
        }

        if (!resp.body) {
          throw new CodexUpstreamError(502, "codex_empty_body", "Codex API returned empty stream");
        }

        return await parseCodexSseStream(
          resp.body,
          req.maxResponseChars,
          req.onDelta,
          () => localAbort.abort("max_response_chars"),
        );
      } finally {
        req.signal.removeEventListener("abort", onParentAbort);
      }
    }

    throw new CodexUpstreamError(401, "codex_unauthorized", "Codex API rejected refreshed token");
  }
}
