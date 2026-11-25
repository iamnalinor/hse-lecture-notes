import { getValidCodexCredentials, type CodexCredentialsPayload } from "./codex-auth";
import type { TrackedD1 } from "../db";
import { fetchViaProxy, ProxyConnectError, ResponseEofError } from "./socks5-fetch";
import type {
  Env,
  FetchLike,
  LlmProvider,
  LlmRoundRequest,
  LlmRoundResult,
} from "../types";
import { LlmUpstreamError as CodexUpstreamError, parseResponsesSseStream as parseCodexSseStream } from "./responses-stream";

export { CodexUpstreamError, parseCodexSseStream };

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

    const roundKey = crypto.randomUUID();
    let retriedTransport = false;
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
          parallel_tool_calls: req.parallelToolCalls ?? true,
          ...(req.toolChoice ? {tool_choice: req.toolChoice} : {}),
          include: ["reasoning.encrypted_content"],
          store: false,
          stream: true,
        };

        const headers: Record<string, string> = {
          Authorization: `Bearer ${creds.accessToken}`,
          "Idempotency-Key": roundKey,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": "codex_cli_rs/0.114.0 (Linux; x86_64)",
          originator: "codex_cli_rs",
        };
        if (creds.accountId) {
          headers["ChatGPT-Account-Id"] = creds.accountId;
        }

        const resp = await this.fetchImpl(this.env.CODEX_RESPONSES_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: localAbort.signal,
        });

        if (resp.status === 401 && !refreshedAuth && attempt < 2) {
          refreshedAuth = true;
          await resp.body?.cancel().catch(() => {});
          creds = await this.loadCreds(true);
          continue;
        }

        if (!resp.ok) {
          await resp.body?.cancel().catch(() => {});
          throw new CodexUpstreamError(
            resp.status,
            resp.status === 429 ? "codex_rate_limited" : "codex_upstream_error",
            `Codex API HTTP ${resp.status}`,
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
          "codex", { enforceProtocol: Boolean(req.toolChoice), hideText: req.hideText },
        );
      } catch (error) {
        const proxyFailure = error instanceof ProxyConnectError &&
          (error.reply === null || [1, 2, 3, 4, 5, 6].includes(error.reply));
        const unconfirmed = error instanceof ResponseEofError && error.stage !== "body";
        if ((!proxyFailure && !unconfirmed) || retriedTransport || req.signal.aborted || attempt >= 2) throw error;
        retriedTransport = true;
        if (unconfirmed) req.onUnconfirmedRetry?.();
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
      } finally {
        req.signal.removeEventListener("abort", onParentAbort);
      }
    }

    throw new CodexUpstreamError(401, "codex_unauthorized", "Codex API rejected refreshed token");
  }
}
