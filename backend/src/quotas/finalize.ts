import { finishAssistantMessageStatement, touchThreadOnFinishStatement } from "../chat/thread-repo";
import type { TrackedD1 } from "../db";
import { estimateUncertainRoundCostMicros, modelPricing } from "../pricing";
import { settleRunStatements } from "./budget-repo";
import type { ExpiredRun, FinalizeRunInput } from "./types";
import {
  addActualCostStatement,
  findExpiredRuns,
  findRunningRun,
  markRunFinishedStatement,
  readRunStateOf,
  runningRunMatch,
} from "./usage-repo";

/**
 * Transitions a `running` run into its single terminal state.
 * Guarded by `WHERE id = ? AND status = 'running'` so concurrent stop/done/error/sweep
 * can NEVER double-charge `budget_hourly` or double-release `budget_reserves`.
 */
export async function finalizeRunAtomic(db: TrackedD1, input: FinalizeRunInput): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const match = runningRunMatch(input.runId, input.errorCode === "run_expired", nowMs);
  const existing = await findRunningRun(db, match);
  if (!existing) return false;

  const mightBeEmptyError =
    input.finalStatus === "error" &&
    input.errorCode !== "run_expired" &&
    input.actualCostMicros === 0 &&
    (input.toolRounds ?? 0) === 0 &&
    (input.streamedOutputChars ?? input.contentTex?.length ?? 0) === 0;
  const uncertainFloor =
    input.isCostUncertain && !input.uncertaintyEstimated
      ? estimateUncertainRoundCostMicros(
          modelPricing(existing.model, existing.pricing_version),
          input.estimatedPromptChars ?? 6000,
          input.streamedOutputChars ?? input.contentTex?.length ?? 0,
        )
      : 0;

  // Keep the run running until all accounting has been applied in this transaction.
  // A competing finalizer sees no running row; a failure rolls back the entire batch.
  const result = await db.batch([
    addActualCostStatement(db, match, input.actualCostMicros, mightBeEmptyError, uncertainFloor),
    finishAssistantMessageStatement(db, match, {
      status: input.messageStatus,
      contentTex: input.contentTex ?? null,
      stepsJson: input.stepsJson ?? null,
      agentItemsJson: input.agentItemsJson ?? null,
      suggestion: input.finalStatus === "done" ? (input.metadata?.suggestion ?? null) : null,
      errorMessage: input.errorMessage ?? null,
      nowMs,
    }),
    touchThreadOnFinishStatement(db, match, nowMs),
    ...settleRunStatements(db, match.condition, match.bindings, nowMs),
    markRunFinishedStatement(db, match, input, nowMs),
  ]);
  return result.at(-1)?.meta.changes === 1;
}

export async function sweepExpiredRuns(db: TrackedD1, nowMs: number): Promise<number> {
  return finalizeExpiredRuns(db, await findExpiredRuns(db, nowMs), nowMs);
}

export async function finalizeExpiredRuns(
  db: TrackedD1,
  expired: ExpiredRun[],
  nowMs: number,
): Promise<number> {
  let swept = 0;
  for (const row of expired) {
    const ok = await finalizeRunAtomic(db, {
      runId: row.id,
      finalStatus: "error",
      messageStatus: "incomplete",
      errorCode: "run_expired",
      errorMessage: "Ответ не завершился вовремя. Попробуй задать вопрос еще раз.",
      actualCostMicros: row.actual_cost_micros,
      isCostUncertain: true,
      nowMs,
    });
    if (ok) swept += 1;
  }
  return swept;
}

/** Settle only the polled run, then return the state committed by the winning finalizer. */
export async function readRunAfterExpiry(db: TrackedD1, run: ExpiredRun, nowMs: number) {
  await finalizeExpiredRuns(db, [run], nowMs);
  return readRunStateOf(db, run.id);
}
