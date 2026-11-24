import { LlmUpstreamError, parseResponsesSseStream } from "./responses-stream";
import type { Env, FetchLike, LlmProvider, LlmRoundRequest, LlmRoundResult } from "../types";

type OpenAIEnv = Pick<Env, "OPENAI_API_KEY" | "OPENAI_BASE_URL">;

/** Standard Responses API with API-key auth; independent of Codex OAuth and proxy. */
export class OpenAIResponsesProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly responsesUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(env: OpenAIEnv, options: { fetchImpl?: FetchLike } = {}) {
    this.apiKey = env.OPENAI_API_KEY?.trim() ?? "";
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    const baseUrl = env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error("OPENAI_BASE_URL must be an absolute HTTP(S) URL");
    }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error("OPENAI_BASE_URL must be an HTTP(S) URL without credentials, query or fragment");
    }
    this.responsesUrl = parsed.href.replace(/\/+$/, "") + "/responses";
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async runRound(req: LlmRoundRequest): Promise<LlmRoundResult> {
    req.signal.throwIfAborted();
    const localAbort = new AbortController();
    const onAbort = () => localAbort.abort(req.signal.reason);
    req.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.fetchImpl(this.responsesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          model: req.model,
          reasoning: { effort: req.effort },
          instructions: req.instructions,
          input: req.input,
          // Existing tools have optional parameters; keep their semantics in Responses.
          tools: req.tools.map(tool => ({ ...tool, strict: tool.strict ?? false })),
          ...(req.toolChoice ? {tool_choice: req.toolChoice} : {}),
          parallel_tool_calls: req.parallelToolCalls ?? true,
          store: false,
          stream: true,
          include: ["reasoning.encrypted_content"],
        }),
        signal: localAbort.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new LlmUpstreamError(response.status,
          response.status === 429 ? "openai_rate_limited" : "openai_upstream_error",
          `OpenAI API HTTP ${response.status}`);
      }
      if (!response.body) throw new LlmUpstreamError(502, "openai_empty_body", "OpenAI API returned empty stream");
      // Never replay a possibly billable request automatically after an HTTP/stream failure.
      return await parseResponsesSseStream(response.body, req.maxResponseChars, req.onDelta,
        () => localAbort.abort("max_response_chars"), "openai", { enforceProtocol: Boolean(req.toolChoice), hideText: req.hideText });
    } finally {
      req.signal.removeEventListener("abort", onAbort);
    }
  }
}
