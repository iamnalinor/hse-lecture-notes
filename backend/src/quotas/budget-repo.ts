import type { TrackedD1 } from "../db";
import type { ServicePolicy } from "../types";
import { RUN_ADMITTED } from "../admission-sql";
import { DAY_MS, HOUR_MS, hourBucketTs, WEEK_MS } from "./time";
import type { BudgetSnapshot } from "./types";

/**
 * SQL for the budget tables: `budget_hourly` (actual spend per hour) and `budget_reserves`
 * (the single row `id = 1` of money held by running runs).
 */

/** Statements 0..2 of every snapshot read, in the order `parseBudgetSnapshot` expects. */
export function budgetSnapshotStatements(db: TrackedD1, nowMs: number): D1PreparedStatement[] {
  const cutoff7d = hourBucketTs(nowMs - WEEK_MS);
  const cutoff24h = hourBucketTs(nowMs - DAY_MS);
  return [
    // global 7d actual (<= 168 rows)
    db
      .prepare(
        "SELECT COALESCE(SUM(global_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff7d),
    // guest 24h actual (<= 24 rows)
    db
      .prepare(
        "SELECT COALESCE(SUM(guest_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff24h),
    // reserves (1 row)
    db.prepare(
      "SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1",
    ),
  ];
}

export function parseBudgetSnapshot(results: D1Result<Record<string, unknown>>[]): BudgetSnapshot {
  return {
    globalActual7d: Number(results[0]?.results[0]?.total ?? 0),
    guestActual24h: Number(results[1]?.results[0]?.total ?? 0),
    globalReserved: Number(results[2]?.results[0]?.global_reserved_micros ?? 0),
    guestReserved: Number(results[2]?.results[0]?.guest_reserved_micros ?? 0),
  };
}

export async function readBudgetSnapshot(db: TrackedD1, nowMs: number): Promise<BudgetSnapshot> {
  return parseBudgetSnapshot(
    await db.batch<Record<string, unknown>>(budgetSnapshotStatements(db, nowMs)),
  );
}

// Used inside the write transaction for both initial reservations and top-ups.
// Needs `delta` and `guest` columns in scope next to `budget_reserves`.
export const budgetFits = `global_reserved_micros + delta +
    (SELECT COALESCE(SUM(global_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) <= ?
    AND (NOT guest OR guest_reserved_micros + delta +
    (SELECT COALESCE(SUM(guest_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) <= ?)`;

/** Bindings of the four `?` in `budgetFits`. */
export function budgetLimits(policy: ServicePolicy, nowMs: number): number[] {
  return [
    hourBucketTs(nowMs - WEEK_MS),
    policy.budgets.weeklyGlobalUsdMicros,
    hourBucketTs(nowMs - DAY_MS),
    policy.budgets.dailyGuestUsdMicros,
  ];
}

/** Move the reservation of a running run up to `target`, when the budgets still fit. */
export function topUpReserveStatement(
  db: TrackedD1,
  policy: ServicePolicy,
  runId: string,
  target: number,
  nowMs: number,
): D1PreparedStatement {
  // Use the persisted reserve for the delta so replaying a checkpoint is free.
  return db
    .prepare(`UPDATE budget_reserves SET global_reserved_micros = global_reserved_micros + delta,
        guest_reserved_micros = guest_reserved_micros + CASE WHEN guest THEN delta ELSE 0 END,
        updated_at = ? FROM (SELECT ? - reserved_cost_micros AS delta, tier = 'guest' AS guest
          FROM usage_runs WHERE id = ? AND status = 'running') WHERE budget_reserves.id = 1
        AND delta > 0 AND ${budgetFits}`)
    .bind(nowMs, target, runId, ...budgetLimits(policy, nowMs));
}

/** Add a fresh reservation for an admitted run (guarded by the run row existing). */
export function addReserveStatement(
  db: TrackedD1,
  runId: string,
  reserveMicros: number,
  isGuest: boolean,
  nowMs: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE budget_reserves
         SET global_reserved_micros = global_reserved_micros + ?,
             guest_reserved_micros = guest_reserved_micros + ?,
             updated_at = ?
         WHERE id = 1 AND ${RUN_ADMITTED}`,
    )
    .bind(reserveMicros, isGuest ? reserveMicros : 0, nowMs, runId);
}

/**
 * Charge the run's actual cost to its hour, then release its reservation. Both read the still-running
 * run row, so they belong in the finalizer transaction before the run leaves `running`.
 */
export function settleRunStatements(
  db: TrackedD1,
  runningCondition: string,
  runBindings: (number | string)[],
  nowMs: number,
): D1PreparedStatement[] {
  const running = `FROM usage_runs WHERE ${runningCondition}`;
  return [
    db
      .prepare(`INSERT INTO budget_hourly (hour_ts, global_actual_micros, guest_actual_micros, updated_at)
      SELECT created_at - created_at % ?, actual_cost_micros,
        CASE WHEN tier = 'guest' THEN actual_cost_micros ELSE 0 END, ? ${running}
      ON CONFLICT(hour_ts) DO UPDATE SET
        global_actual_micros = budget_hourly.global_actual_micros + excluded.global_actual_micros,
        guest_actual_micros = budget_hourly.guest_actual_micros + excluded.guest_actual_micros,
        updated_at = excluded.updated_at`)
      .bind(HOUR_MS, nowMs, ...runBindings),
    db
      .prepare(`UPDATE budget_reserves SET
      global_reserved_micros = MAX(0, global_reserved_micros - run.reserved_cost_micros),
      guest_reserved_micros = MAX(0, guest_reserved_micros -
        CASE WHEN run.tier = 'guest' THEN run.reserved_cost_micros ELSE 0 END),
      updated_at = ? FROM (SELECT tier, reserved_cost_micros ${running}) AS run
      WHERE budget_reserves.id = 1`)
      .bind(nowMs, ...runBindings),
  ];
}
