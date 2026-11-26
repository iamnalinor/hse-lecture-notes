import { CodexAuthError } from "../../llm/codex-auth";
import { LlmUpstreamError } from "../../llm/responses-stream";
import { ProxyConnectError, ResponseEofError } from "../../llm/socks5-fetch";
import { logEvent } from "../../logger";
import { estimateUncertainRoundCostMicros } from "../../pricing";
import { classifyError } from "../../public-error";
import type { AgentLoopParams, TurnState } from "./state";

/**
 * Records an exception that ended the turn: charges an estimate for a request whose outcome is
 * unknown, picks the error code, and decides whether the partial answer is kept (`incomplete`)
 * or the run failed (`error`).
 */
export function recordTurnFailure(
  p: AgentLoopParams,
  s: TurnState,
  error: unknown,
  runSignal: AbortSignal,
): void {
  const proxy = error instanceof ProxyConnectError;
  const unknownRequest =
    s.pendingRequest &&
    !proxy &&
    !(error instanceof CodexAuthError) &&
    !(error instanceof LlmUpstreamError && error.status < 500);
  s.uncertain ||= unknownRequest;
  if (unknownRequest)
    s.cost += estimateUncertainRoundCostMicros(
      p.route,
      s.estimatedPromptChars,
      s.text.length - s.roundStartChars,
    );
  s.errorCode =
    error instanceof CodexAuthError
      ? "oauth_unavailable"
      : error instanceof LlmUpstreamError
        ? "upstream_error"
        : error instanceof ResponseEofError
          ? "upstream_eof"
          : classifyError(error).code;
  if (!runSignal.aborted)
    logEvent("error", "agent_run_exception", {
      runId: p.runId,
      code: s.errorCode,
      upstreamStatus: error instanceof LlmUpstreamError ? error.status : undefined,
      detail: classifyError(error).detail,
    });
  s.finalStatus = s.text.trim() ? "incomplete" : "error";
}
