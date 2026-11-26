import { finalizeRunAtomic } from "../../quotas";
import { encodeEnvelope, type PreparedTurnContext } from "../history";
import { runErrorMessage } from "../run-error";
import type { AgentLoopParams, TurnState } from "./state";

/**
 * Fixes the final status when the run was interrupted: a stop by the student wins, then a timeout
 * or a lost client. Steps still running are marked failed once the run's own signal fired.
 */
export function applyInterruption(
  p: AgentLoopParams,
  s: TurnState,
  interruption: { timedOut: boolean; runAborted: boolean },
): void {
  if (p.isStoppedByUser()) {
    s.finalStatus = "stopped";
    s.metadata = undefined;
    s.errorCode = "user_stopped";
  } else if (interruption.timedOut || p.signal.aborted) {
    s.finalStatus = "incomplete";
    s.metadata = undefined;
    s.errorCode = interruption.timedOut ? "run_timeout" : "upstream_incomplete";
  }
  if (interruption.runAborted) {
    for (const step of s.steps) if (step.state === "running") step.state = "error";
  }
  if (s.finalStatus !== "done") s.metadata = undefined;
}

/** Writes the terminal state once and sends the closing frame (or `run_expired` when another finalizer won). */
export async function settleRun(
  p: AgentLoopParams,
  s: TurnState,
  prepared: PreparedTurnContext | undefined,
): Promise<void> {
  const { finalStatus, text, steps } = s;
  const errorMessage =
    finalStatus === "done" || finalStatus === "stopped"
      ? null
      : runErrorMessage(s.errorCode, Boolean(text.trim()));
  const won = await finalizeRunAtomic(p.db, {
    runId: p.runId,
    finalStatus,
    messageStatus: finalStatus,
    contentTex: text,
    stepsJson: JSON.stringify(steps),
    agentItemsJson: encodeEnvelope({
      version: 1,
      complete: finalStatus === "done",
      provenance: prepared?.provenance ?? null,
      items: s.newItems,
    }),
    metadata: s.metadata,
    errorCode: s.errorCode,
    errorMessage,
    actualCostMicros: s.cost,
    isCostUncertain: s.uncertain,
    uncertaintyEstimated: true,
    estimatedPromptChars: s.estimatedPromptChars,
    streamedOutputChars: text.length,
    inputTokens: s.inputTokens,
    cachedTokens: s.cachedTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    outputTokens: s.outputTokens,
    toolRounds: s.rounds,
    toolCalls: s.toolCalls,
  });
  if (!won) {
    p.sendFrame({
      type: "error",
      code: "run_expired",
      message: "Ответ уже завершен. Обнови историю беседы.",
    });
    return;
  }
  p.sendFrame({
    type: "done",
    runId: p.runId,
    status: finalStatus,
    errorMessage,
    text,
    steps,
    degraded: p.degraded,
    block: null,
    suggestion: s.metadata?.suggestion ?? null,
    contextLimited: p.contextLimited ?? false,
  });
}
