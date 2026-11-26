import type { TrackedD1 } from "../db";
import type { ModelId, QuotaBucket, RunStatus } from "../types";
import { budgetFits } from "./budget-repo";
import { RUN_ADMITTED, type SqlGuard } from "../admission-sql";
import { DAY_MS } from "./time";
import type { ExpiredRun, FinalizeRunInput } from "./types";

/** SQL and row types of `usage_runs`: one row per chat run, the unit of quotas and cost accounting. */

export type CountColumn = "browser_id" | "fingerprint" | "ip_address" | "telegram_id";
export type IdentityValue = number | string;

/** Bindings that locate one still-running run (and, for the sweeper, only once it has expired). */
export interface RunningRunMatch {
  condition: string;
  bindings: (number | string)[];
}

export function runningRunMatch(runId: string, expiring: boolean, nowMs: number): RunningRunMatch {
  return {
    condition: "id = ? AND status = 'running'" + (expiring ? " AND expires_at < ?" : ""),
    bindings: expiring ? [runId, nowMs] : [runId],
  };
}

// ---------------------------------------------------------------------------
// Quota windows
// ---------------------------------------------------------------------------

/**
A day-window count and the moment it drops below `limit`: the `limit`-th newest run leaves the window.
The oldest run is not enough: after the limit is lowered, or when another axis (IP, fingerprint) counts
the same browser's older runs, more than `limit` runs sit in the window, and the block outlives the
oldest one. `oldest` keeps its name for the callers: it is that run's time, or null under the limit.
*/
function windowCount(
  db: TrackedD1,
  column: CountColumn,
  value: IdentityValue,
  filter: string,
  cutoff: number,
  limit: number,
): D1PreparedStatement {
  const where = `${column} = ?${filter} AND created_at >= ?`;
  return db
    .prepare(
      `SELECT COUNT(*) AS cnt, (SELECT created_at FROM usage_runs WHERE ${where} ORDER BY created_at DESC LIMIT 1 OFFSET ?) AS oldest FROM usage_runs WHERE ${where}`,
    )
    .bind(value, cutoff, Math.max(0, limit - 1), value, cutoff);
}

/** Per-minute rate window. Browser and account counts use `quota_bucket IN ('high', 'low')` for the browser index range. */
export function rateWindow(
  db: TrackedD1,
  column: CountColumn,
  value: IdentityValue,
  minCutoff: number,
  limit: number,
): D1PreparedStatement {
  const anyBucket =
    column === "ip_address" || column === "fingerprint"
      ? ""
      : " AND quota_bucket IN ('high', 'low')";
  return windowCount(db, column, value, anyBucket, minCutoff, limit);
}

/** 24h quota window; failed runs (`status = 'error'`) never consume user quota. */
export function dayWindow(
  db: TrackedD1,
  column: CountColumn,
  value: IdentityValue,
  bucket: "high" | "low" | null,
  dayCutoff: number,
  limit: number,
): D1PreparedStatement {
  return windowCount(
    db,
    column,
    value,
    `${bucket === null ? "" : ` AND quota_bucket = '${bucket}'`} AND status != 'error'`,
    dayCutoff,
    limit,
  );
}

export function activeRunCount(
  db: TrackedD1,
  column: CountColumn,
  value: IdentityValue,
  nowMs: number,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND ${column} = ?`,
    )
    .bind(nowMs, value);
}

// ---------------------------------------------------------------------------
// Expired runs
// ---------------------------------------------------------------------------

const EXPIRED = "status = 'running' AND expires_at < ? AND created_at >= ? LIMIT 10";

// Match the predicates of the blocked day window. Each lookup is bounded to this
// identity's index range, even when there are many expired runs elsewhere.
export function expiredByBrowser(
  db: TrackedD1,
  browserId: string,
  nowMs: number,
  dayCutoff: number,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT id,actual_cost_micros FROM usage_runs INDEXED BY idx_usage_runs_browser
       WHERE browser_id = ? AND quota_bucket = 'low' AND ${EXPIRED}`,
    )
    .bind(browserId, nowMs, dayCutoff);
}

export function expiredByIp(
  db: TrackedD1,
  ipAddress: string,
  nowMs: number,
  dayCutoff: number,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT id,actual_cost_micros FROM usage_runs INDEXED BY idx_usage_runs_ip
       WHERE ip_address = ? AND ${EXPIRED}`,
    )
    .bind(ipAddress, nowMs, dayCutoff);
}

export function expiredByFingerprint(
  db: TrackedD1,
  fingerprint: string,
  nowMs: number,
  dayCutoff: number,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT id,actual_cost_micros FROM usage_runs INDEXED BY idx_usage_runs_fp
       WHERE fingerprint = ? AND fingerprint != '' AND ${EXPIRED}`,
    )
    .bind(fingerprint, nowMs, dayCutoff);
}

export async function findExpiredRuns(db: TrackedD1, nowMs: number): Promise<ExpiredRun[]> {
  const expired = await db.all<ExpiredRun>(
    db
      .prepare(
        "SELECT id, actual_cost_micros FROM usage_runs WHERE status = 'running' AND expires_at < ? LIMIT 10",
      )
      .bind(nowMs),
  );
  return expired.results;
}

export function readRunStateOf(db: TrackedD1, runId: string) {
  return db.first<{ status: RunStatus; expires_at: number }>(
    db.prepare("SELECT status,expires_at FROM usage_runs WHERE id = ?").bind(runId),
  );
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export interface IdempotentRunRow {
  id: string;
  payload_hash: string;
  thread_id: string;
  user_message_id: string;
  assistant_message_id: string;
  status: RunStatus;
  model: ModelId;
}

/**
 * Finds the run created for a clientRequestId. A signed-in caller also matches the guest owner
 * key `br:<browserId>` (it survives login).
 */
export function findRunByClientRequest(
  db: TrackedD1,
  isGuest: boolean,
  ownerKey: string,
  browserId: string,
  clientRequestId: string,
): Promise<IdempotentRunRow | null> {
  return isGuest
    ? db.first<IdempotentRunRow>(
        db
          .prepare(
            "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key = ? AND client_request_id = ?",
          )
          .bind(ownerKey, clientRequestId),
      )
    : db.first<IdempotentRunRow>(
        db
          .prepare(
            "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key IN (?, ?) AND client_request_id = ? LIMIT 1",
          )
          .bind(ownerKey, `br:${browserId}`, clientRequestId),
      );
}

// ---------------------------------------------------------------------------
// Finalization and checkpoints
// ---------------------------------------------------------------------------

export function findRunningRun(db: TrackedD1, match: RunningRunMatch) {
  return db.first<{ model: string; pricing_version: number }>(
    db
      .prepare(`SELECT model, pricing_version FROM usage_runs
                WHERE ${match.condition}`)
      .bind(...match.bindings),
  );
}

export function addActualCostStatement(
  db: TrackedD1,
  match: RunningRunMatch,
  actualCostMicros: number,
  mightBeEmptyError: boolean,
  uncertainFloor: number,
): D1PreparedStatement {
  return db
    .prepare(`UPDATE usage_runs SET actual_cost_micros = MAX(?,
      actual_cost_micros + CASE WHEN ? AND actual_cost_micros = 0 THEN 0 ELSE ? END)
      WHERE ${match.condition}`)
    .bind(
      Math.ceil(actualCostMicros),
      mightBeEmptyError ? 1 : 0,
      uncertainFloor,
      ...match.bindings,
    );
}

/** The last write of the finalizer: moves the run out of `running`; `changes === 1` means this call won. */
export function markRunFinishedStatement(
  db: TrackedD1,
  match: RunningRunMatch,
  input: FinalizeRunInput,
  nowMs: number,
): D1PreparedStatement {
  return db
    .prepare(`UPDATE usage_runs SET status = ?, finished_at = ?, updated_at = ?,
      reserved_cost_micros = 0, is_cost_uncertain = MAX(is_cost_uncertain, ?),
      input_tokens = COALESCE(?, input_tokens), cached_tokens = COALESCE(?, cached_tokens),
      cache_write_tokens = COALESCE(?, cache_write_tokens), output_tokens = COALESCE(?, output_tokens),
      tool_rounds = COALESCE(?, tool_rounds), tool_calls = COALESCE(?, tool_calls), error_code = ?
      WHERE ${match.condition}`)
    .bind(
      input.finalStatus,
      nowMs,
      nowMs,
      input.isCostUncertain ? 1 : 0,
      input.inputTokens ?? null,
      input.cachedTokens ?? null,
      input.cacheWriteTokens ?? null,
      input.outputTokens ?? null,
      input.toolRounds ?? null,
      input.toolCalls ?? null,
      input.errorCode ?? null,
      ...match.bindings,
    );
}

export function recordProgressStatement(
  db: TrackedD1,
  runId: string,
  progress: {
    cumulativeActualMicros: number;
    inputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    toolRounds: number;
    toolCalls: number;
    nowMs: number;
  },
): D1PreparedStatement {
  return db
    .prepare(`UPDATE usage_runs SET
    actual_cost_micros = ?, input_tokens = ?, cached_tokens = ?, cache_write_tokens = ?,
    output_tokens = ?, tool_rounds = ?, tool_calls = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND actual_cost_micros <= ?`)
    .bind(
      progress.cumulativeActualMicros,
      progress.inputTokens,
      progress.cachedTokens,
      progress.cacheWriteTokens,
      progress.outputTokens,
      progress.toolRounds,
      progress.toolCalls,
      progress.nowMs,
      runId,
      progress.cumulativeActualMicros,
    );
}

/** Follows a reserve top-up: `changes()` is the preceding reserve update in this transaction. */
export function setReservedAfterTopUpStatement(
  db: TrackedD1,
  runId: string,
  target: number,
): D1PreparedStatement {
  return db
    .prepare(`UPDATE usage_runs SET reserved_cost_micros = ?
        WHERE id = ? AND status = 'running' AND changes() = 1`)
    .bind(target, runId);
}

export function readReserveStatement(db: TrackedD1, runId: string): D1PreparedStatement {
  return db.prepare("SELECT reserved_cost_micros, status FROM usage_runs WHERE id = ?").bind(runId);
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

export interface RunInsert {
  runId: string;
  ownerKey: string;
  clientRequestId: string;
  payloadHash: string;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  nowMs: number;
  expiresAt: number;
  tier: string;
  bucket: QuotaBucket;
  model: string;
  pricingVersion: number;
  effort: string;
  telegramId: number | null;
  browserId: string;
  ipAddress: string;
  fingerprint: string;
  provider: string;
  reserveMicros: number;
  isGuest: boolean;
  budgetBindings: number[];
  retryAssistantSeq: number | null;
}

/**
 * Inserts the run row only when every guard holds in the same statement: the budgets fit, the
 * identity is under its quotas and not running, the thread belongs to the caller and has not moved.
 */
export function insertRunStatement(
  db: TrackedD1,
  run: RunInsert,
  quotaGuard: SqlGuard,
  threadGuard: SqlGuard,
  contextGuard: SqlGuard,
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO usage_runs (
      id, owner_key, client_request_id, payload_hash, thread_id, user_message_id, assistant_message_id,
      created_at, updated_at, expires_at, status, tier, quota_bucket, model, pricing_version, reasoning_effort,
      reserved_cost_micros, telegram_id, browser_id, ip_address, fingerprint, provider)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, delta, ?, ?, ?, ?, ?
      FROM budget_reserves, (SELECT ? AS delta, ? AS guest)
      WHERE id = 1 AND ${budgetFits} AND ${quotaGuard.sql} AND ${threadGuard.sql} AND ${contextGuard.sql}
        AND (? IS NULL OR ? = (SELECT MAX(seq) FROM chat_messages WHERE thread_id = ?))`)
    .bind(
      run.runId,
      run.ownerKey,
      run.clientRequestId,
      run.payloadHash,
      run.threadId,
      run.userMessageId,
      run.assistantMessageId,
      run.nowMs,
      run.nowMs,
      run.expiresAt,
      run.tier,
      run.bucket,
      run.model,
      run.pricingVersion,
      run.effort,
      run.telegramId,
      run.browserId,
      run.ipAddress,
      run.fingerprint,
      run.provider,
      run.reserveMicros,
      run.isGuest ? 1 : 0,
      ...run.budgetBindings,
      ...quotaGuard.bindings,
      ...threadGuard.bindings,
      ...contextGuard.bindings,
      run.retryAssistantSeq,
      run.retryAssistantSeq,
      run.threadId,
    );
}

export type AdmissionRefusal =
  | "thread_changed"
  | "reevaluate"
  | "stale_retry"
  | "global_budget_exceeded"
  | "guest_budget_exceeded";

/** Appended to the admission batch: reports why the run insert was refused, from the same snapshot. */
export function admissionRefusalStatement(
  db: TrackedD1,
  args: {
    runId: string;
    threadGuard: SqlGuard;
    contextGuard: SqlGuard;
    retryAssistantSeq: number | null;
    threadId: string;
    reserveMicros: number;
    isGuest: boolean;
    weekCutoff: number;
    weeklyGlobalUsdMicros: number;
    dayCutoff: number;
    dailyGuestUsdMicros: number;
  },
): D1PreparedStatement {
  const { threadGuard, contextGuard } = args;
  return db
    .prepare(`SELECT CASE
      WHEN NOT ${threadGuard.sql} THEN 'thread_changed'
      WHEN NOT ${contextGuard.sql} THEN 'reevaluate'
      WHEN ? IS NOT NULL AND ? IS NOT (SELECT MAX(seq) FROM chat_messages WHERE thread_id = ?)
        THEN 'stale_retry'
      WHEN global_reserved_micros + ? +
        (SELECT COALESCE(SUM(global_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) > ?
        THEN 'global_budget_exceeded'
      WHEN ? AND guest_reserved_micros + ? +
        (SELECT COALESCE(SUM(guest_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) > ?
        THEN 'guest_budget_exceeded'
      ELSE 'reevaluate' END AS reason
      FROM budget_reserves WHERE id = 1 AND NOT ${RUN_ADMITTED}`)
    .bind(
      ...threadGuard.bindings,
      ...contextGuard.bindings,
      args.retryAssistantSeq,
      args.retryAssistantSeq,
      args.threadId,
      args.reserveMicros,
      args.weekCutoff,
      args.weeklyGlobalUsdMicros,
      args.isGuest ? 1 : 0,
      args.reserveMicros,
      args.dayCutoff,
      args.dailyGuestUsdMicros,
      args.runId,
    );
}

/**
 * Per-identity guard of the admission insert, mirroring `evaluateQuotasAndBudgets` inside the
 * write transaction: not already running, under the per-minute rate and under the daily quota.
 * Browser and account counts are per bucket; IP and fingerprint counts span both.
 */
export function identityQuotaGuard(
  identifiers: [CountColumn, IdentityValue][],
  bucket: QuotaBucket,
  dailyLimit: number,
  rateLimitPerMinute: number,
  nowMs: number,
): SqlGuard {
  const clauses: string[] = [];
  const bindings: (number | string)[] = [];
  for (const [column, value] of identifiers) {
    const separateBuckets = column === "browser_id" || column === "telegram_id";
    const bucketFilter = separateBuckets ? "AND quota_bucket = ?" : "";
    clauses.push(
      `NOT EXISTS (SELECT 1 FROM usage_runs WHERE ${column} = ? AND status = 'running' AND expires_at >= ?)`,
      `(SELECT COUNT(*) FROM usage_runs WHERE ${column} = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?) < ?`,
      `(SELECT COUNT(*) FROM usage_runs WHERE ${column} = ? ${bucketFilter} AND created_at >= ? AND status != 'error') < ?`,
    );
    bindings.push(
      value,
      nowMs,
      value,
      nowMs - 60_000,
      rateLimitPerMinute,
      value,
      ...(separateBuckets ? [bucket] : []),
      nowMs - DAY_MS,
      dailyLimit,
    );
  }
  return { sql: clauses.join(" AND "), bindings };
}
