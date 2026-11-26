import type { TrackedD1 } from "../db";
import type { ServicePolicy } from "../types";
import { topUpReserveStatement } from "./budget-repo";
import { reserveFor } from "./policy";
import type { CheckpointRoundParams } from "./types";
import {
  readReserveStatement,
  recordProgressStatement,
  setReservedAfterTopUpStatement,
} from "./usage-repo";

/**
 * Light checkpoint after each completed LLM round (does not modify indexed columns)
 * plus reserve top-up if cumulative cost exceeds initial reserve.
 */
export async function checkpointRound(
  db: TrackedD1,
  policy: ServicePolicy,
  params: CheckpointRoundParams,
): Promise<{ updatedReservedMicros: number; canContinueToolRounds: boolean }> {
  const roundBuffer = Math.ceil(reserveFor(policy, params.bucket) / 2);
  const target = params.cumulativeActualMicros + roundBuffer;

  const stmts = [recordProgressStatement(db, params.runId, params)];
  if (target > params.currentReservedMicros) {
    stmts.push(
      topUpReserveStatement(db, policy, params.runId, target, params.nowMs),
      setReservedAfterTopUpStatement(db, params.runId, target),
    );
  }
  stmts.push(readReserveStatement(db, params.runId));
  const results = await db.batch<{
    reserved_cost_micros: number;
    status: string;
  }>(stmts);
  const run = results.at(-1)?.results[0];
  return {
    updatedReservedMicros: run?.reserved_cost_micros ?? 0,
    canContinueToolRounds: run?.status === "running" && run.reserved_cost_micros >= target,
  };
}
