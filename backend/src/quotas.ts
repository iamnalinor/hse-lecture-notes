import { prepareTurnContext, type PreparedTurnContext } from "./chat-history";
import { randomToken } from "./crypto";
import type { TrackedD1 } from "./db";
import {
  estimateUncertainRoundCostMicros,
  resolveModelRoute,
  modelPricing,
  type ModelRoute,
} from "./pricing";
import { shortenThreadTitle } from "./thread-title";
import { sendOwnerAlert } from "./telegram-alerts";
import {
  type BlockInfo,
  type DegradedInfo,
  type Env,
  type EndTurnMetadata,
  type MessageStatus,
  type ModelId,
  type QuotaBucket,
  type QuotePayload,
  type RunStatus,
  type ServicePolicy,
  type Tier,
} from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function hourBucketTs(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS;
}

export async function loadPolicy(db: TrackedD1): Promise<ServicePolicy> {
  const row = await db.first<{ value_json: string }>(
    db.prepare("SELECT value_json FROM service_config WHERE key = 'policy'"),
  );
  if (!row) throw new Error("Service policy is missing. Run init-db.");
  return JSON.parse(row.value_json) as ServicePolicy;
}

function highQuotaLimit(policy: ServicePolicy, tier: Tier): number {
  return tier === "student" || tier === "extended" ? policy.buckets.high.limits[tier] : 0;
}

export interface BudgetSnapshot {
  globalActual7d: number;
  guestActual24h: number;
  globalReserved: number;
  guestReserved: number;
}

export async function readBudgetSnapshot(db: TrackedD1, nowMs: number): Promise<BudgetSnapshot> {
  const cutoff7d = hourBucketTs(nowMs - WEEK_MS);
  const cutoff24h = hourBucketTs(nowMs - DAY_MS);

  const [globalRes, guestRes, reserveRes] = await db.batch<Record<string, number>>([
    db
      .prepare(
        "SELECT COALESCE(SUM(global_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff7d),
    db
      .prepare(
        "SELECT COALESCE(SUM(guest_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff24h),
    db.prepare(
      "SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1",
    ),
  ]);

  const globalActual7d = Number(globalRes?.results[0]?.total ?? 0);
  const guestActual24h = Number(guestRes?.results[0]?.total ?? 0);
  const reserveRow = reserveRes?.results[0];
  return {
    globalActual7d,
    guestActual24h,
    globalReserved: Number(reserveRow?.global_reserved_micros ?? 0),
    guestReserved: Number(reserveRow?.guest_reserved_micros ?? 0),
  };
}

export interface IdentityAxes {
  tier: Tier;
  telegramId: number | null;
  browserId: string;
  ipAddress: string;
  fingerprint: string;
}

export interface QuotaEvaluation {
  allowed: boolean;
  bucket: QuotaBucket;
  reserveMicros: number;
  degraded: DegradedInfo;
  block: BlockInfo | null;
  weeklyWarnTriggered: boolean;
  budget: BudgetSnapshot;
}

interface CountRow {
  cnt: number;
  oldest: number | null;
}

export async function evaluateQuotasAndBudgets(
  db: TrackedD1,
  policy: ServicePolicy,
  axes: IdentityAxes,
  nowMs: number,
  options: {
    checkConcurrency?: boolean;
    checkRateLimit?: boolean;
    forceLow?: boolean;
  } = {},
): Promise<QuotaEvaluation> {
  const checkConcurrency = options.checkConcurrency ?? true;
  const checkRateLimit = options.checkRateLimit ?? true;

  const minCutoff = nowMs - 60_000;
  const dayCutoff = nowMs - DAY_MS;
  const cutoff7d = hourBucketTs(nowMs - WEEK_MS);
  const cutoff24h = hourBucketTs(nowMs - DAY_MS);

  const isGuest = axes.tier === "guest" || axes.telegramId === null;
  const useFp = isGuest && axes.fingerprint.length > 0;

  if (isGuest && policy.requireLoginWithoutFingerprint && !axes.fingerprint) {
    const budget = await readBudgetSnapshot(db, nowMs);
    return {
      allowed: false,
      bucket: "low",
      reserveMicros: policy.budgets.reserveLowMicros,
      degraded: { active: false },
      block: { code: "auth_required" },
      weeklyWarnTriggered: false,
      budget,
    };
  }

  // Build one consolidated D1.batch() for budgets + rate limits + active runs + daily buckets
  const stmts: D1PreparedStatement[] = [
    // 0: global 7d actual (<= 168 rows)
    db
      .prepare(
        "SELECT COALESCE(SUM(global_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff7d),
    // 1: guest 24h actual (<= 24 rows)
    db
      .prepare(
        "SELECT COALESCE(SUM(guest_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?",
      )
      .bind(cutoff24h),
    // 2: reserves (1 row)
    db.prepare(
      "SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1",
    ),
  ];

  // Track indices dynamically for clean parsing
  const idx: Record<string, number> = {};
  const add = (name: string, stmt: D1PreparedStatement) => {
    idx[name] = stmts.length;
    stmts.push(stmt);
  };

  if (isGuest) {
    // Rate limit (uses quota_bucket IN ('high','low') for idx_usage_runs_browser time range)
    if (checkRateLimit) {
      add(
        "rate_br",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?",
          )
          .bind(axes.browserId, minCutoff),
      );
      add(
        "rate_ip",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE ip_address = ? AND created_at >= ?",
          )
          .bind(axes.ipAddress, minCutoff),
      );
      if (useFp) {
        add(
          "rate_fp",
          db
            .prepare(
              "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE fingerprint = ? AND created_at >= ?",
            )
            .bind(axes.fingerprint, minCutoff),
        );
      }
    }

    if (checkConcurrency) {
      add(
        "run_br",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND browser_id = ?",
          )
          .bind(nowMs, axes.browserId),
      );
      add(
        "run_ip",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND ip_address = ?",
          )
          .bind(nowMs, axes.ipAddress),
      );
      if (useFp) {
        add(
          "run_fp",
          db
            .prepare(
              "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND fingerprint = ?",
            )
            .bind(nowMs, axes.fingerprint),
        );
      }
    }

    // 24h guest quota (low bucket) — failed runs (status = 'error') never consume user quota
    add(
      "low_br",
      db
        .prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'",
        )
        .bind(axes.browserId, dayCutoff),
    );
    add(
      "low_ip",
      db
        .prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE ip_address = ? AND created_at >= ? AND status != 'error'",
        )
        .bind(axes.ipAddress, dayCutoff),
    );
    if (useFp) {
      add(
        "low_fp",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE fingerprint = ? AND created_at >= ? AND status != 'error'",
          )
          .bind(axes.fingerprint, dayCutoff),
      );
    }
  } else {
    const tgId = axes.telegramId!;
    if (checkRateLimit) {
      add(
        "rate_tg",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?",
          )
          .bind(tgId, minCutoff),
      );
      add(
        "rate_br",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?",
          )
          .bind(axes.browserId, minCutoff),
      );
    }

    if (checkConcurrency) {
      add(
        "run_tg",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND telegram_id = ?",
          )
          .bind(nowMs, tgId),
      );
      add(
        "run_br",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND browser_id = ?",
          )
          .bind(nowMs, axes.browserId),
      );
    }

    add(
      "low_tg",
      db
        .prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'",
        )
        .bind(tgId, dayCutoff),
    );
    add(
      "low_br",
      db
        .prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'",
        )
        .bind(axes.browserId, dayCutoff),
    );

    if (axes.tier === "student" || axes.tier === "extended") {
      add(
        "high_tg",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket = 'high' AND created_at >= ? AND status != 'error'",
          )
          .bind(tgId, dayCutoff),
      );
      add(
        "high_br",
        db
          .prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'high' AND created_at >= ? AND status != 'error'",
          )
          .bind(axes.browserId, dayCutoff),
      );
    }
  }

  const results = await db.batch<Record<string, unknown>>(stmts);

  const budget: BudgetSnapshot = {
    globalActual7d: Number(results[0]?.results[0]?.total ?? 0),
    guestActual24h: Number(results[1]?.results[0]?.total ?? 0),
    globalReserved: Number(results[2]?.results[0]?.global_reserved_micros ?? 0),
    guestReserved: Number(results[2]?.results[0]?.guest_reserved_micros ?? 0),
  };

  const getCount = (key: string): CountRow => {
    const i = idx[key];
    if (i === undefined) return { cnt: 0, oldest: null };
    const row = results[i]?.results[0];
    return {
      cnt: Number(row?.cnt ?? 0),
      oldest: typeof row?.oldest === "number" ? row.oldest : null,
    };
  };

  const maxAxis = (keys: string[]): { count: number; oldest: number | null } => {
    let count = 0;
    let oldest: number | null = null;
    for (const k of keys) {
      const r = getCount(k);
      if (r.cnt > count) {
        count = r.cnt;
        oldest = r.oldest;
      } else if (r.cnt === count && r.cnt > 0 && r.oldest !== null) {
        oldest = oldest === null ? r.oldest : Math.min(oldest, r.oldest);
      }
    }
    return { count, oldest };
  };

  // Determine the quota bucket and degradation state first
  let bucket: QuotaBucket = "low";
  let degraded: DegradedInfo = { active: false };
  let quotaBlock: BlockInfo | null = null;

  if (isGuest) {
    const lowKeys = useFp ? ["low_br", "low_ip", "low_fp"] : ["low_br", "low_ip"];
    const low = maxAxis(lowKeys);
    if (low.count >= policy.buckets.low.limits.guest) {
      quotaBlock = {
        code: "auth_required",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
      };
    }
  } else if (axes.tier === "default") {
    const low = maxAxis(["low_tg", "low_br"]);
    if (low.count >= policy.buckets.low.limits.default) {
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
      };
    }
  } else if (options.forceLow) {
    const low = maxAxis(["low_tg", "low_br"]);
    if (low.count >= policy.buckets.low.limits[axes.tier])
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
      };
  } else {
    // Assigned account tiers have independent high and low quotas
    const high = maxAxis(["high_tg", "high_br"]);
    const low = maxAxis(["low_tg", "low_br"]);
    if (high.count < highQuotaLimit(policy, axes.tier)) {
      bucket = "high";
      degraded = { active: false };
    } else if (low.count < policy.buckets.low.limits[axes.tier]) {
      bucket = "low";
      degraded = {
        active: true,
        restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS,
      };
    } else {
      bucket = "low";
      degraded = {
        active: true,
        restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS,
      };
      const candidates = [high.oldest, low.oldest].filter((v): v is number => v !== null);
      const earliest = candidates.length > 0 ? Math.min(...candidates) : nowMs;
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: earliest + DAY_MS,
      };
    }
  }

  const reserveMicros =
    bucket === "high" ? policy.budgets.reserveHighMicros : policy.budgets.reserveLowMicros;

  const globalProjected = budget.globalActual7d + budget.globalReserved + reserveMicros;
  const weeklyWarnTriggered =
    globalProjected >=
    Math.floor(policy.budgets.weeklyGlobalUsdMicros * policy.budgets.weeklyWarnRatio);

  // Check global 7d budget
  if (globalProjected > policy.budgets.weeklyGlobalUsdMicros) {
    return {
      allowed: false,
      bucket,
      reserveMicros,
      degraded,
      block: { code: "global_budget_exceeded" },
      weeklyWarnTriggered: true,
      budget,
    };
  }

  // Check guest 24h budget
  if (isGuest) {
    const guestProjected = budget.guestActual24h + budget.guestReserved + reserveMicros;
    if (guestProjected > policy.budgets.dailyGuestUsdMicros) {
      return {
        allowed: false,
        bucket,
        reserveMicros,
        degraded,
        block: { code: "guest_budget_exceeded" },
        weeklyWarnTriggered,
        budget,
      };
    }
  }

  // Check tier/guest daily quota
  if (quotaBlock) {
    return {
      allowed: false,
      bucket,
      reserveMicros,
      degraded,
      block: quotaBlock,
      weeklyWarnTriggered,
      budget,
    };
  }

  // Check active concurrency (1 running)
  if (checkConcurrency) {
    const runKeys = isGuest
      ? useFp
        ? ["run_br", "run_ip", "run_fp"]
        : ["run_br", "run_ip"]
      : ["run_tg", "run_br"];
    const active = maxAxis(runKeys);
    if (active.count >= 1) {
      return {
        allowed: false,
        bucket,
        reserveMicros,
        degraded,
        block: { code: "concurrent_run" },
        weeklyWarnTriggered,
        budget,
      };
    }
  }

  // Check per-minute rate limit
  if (checkRateLimit) {
    const rateKeys = isGuest
      ? useFp
        ? ["rate_br", "rate_ip", "rate_fp"]
        : ["rate_br", "rate_ip"]
      : ["rate_tg", "rate_br"];
    const rate = maxAxis(rateKeys);
    if (rate.count >= policy.rateLimitPerMinute) {
      const retryAfterSec = rate.oldest
        ? Math.max(1, Math.ceil((rate.oldest + 60_000 - nowMs) / 1000))
        : 15;
      return {
        allowed: false,
        bucket,
        reserveMicros,
        degraded,
        block: { code: "rate_limited", retryAfterSec },
        weeklyWarnTriggered,
        budget,
      };
    }
  }

  return {
    allowed: true,
    bucket,
    reserveMicros,
    degraded,
    block: null,
    weeklyWarnTriggered,
    budget,
  };
}

// =============================================================================
// Single-finalization CAS + expired running sweep + mid-run checkpoints
// =============================================================================

interface FinalizeRunInput {
  runId: string;
  finalStatus: Exclude<RunStatus, "running">;
  messageStatus: MessageStatus;
  contentTex?: string;
  stepsJson?: string | null;
  agentItemsJson?: string | null;
  metadata?: EndTurnMetadata;
  errorMessage?: string | null;
  errorCode?: string | null;
  actualCostMicros: number;
  isCostUncertain: boolean;
  uncertaintyEstimated?: boolean;
  estimatedPromptChars?: number;
  streamedOutputChars?: number;
  inputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  toolRounds?: number;
  toolCalls?: number;
  nowMs?: number;
}

/**
 * Transitions a `running` run into its single terminal state.
 * Guarded by `WHERE id = ? AND status = 'running'` so concurrent stop/done/error/sweep
 * can NEVER double-charge `budget_hourly` or double-release `budget_reserves`.
 */
export async function finalizeRunAtomic(db: TrackedD1, input: FinalizeRunInput): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const existing = await db.first<{ model: string; pricing_version: number }>(
    db
      .prepare(`SELECT model, pricing_version FROM usage_runs
                WHERE id = ? AND status = 'running'`)
      .bind(input.runId),
  );
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
  const running = "FROM usage_runs WHERE id = ? AND status = 'running'";
  const result = await db.batch([
    db
      .prepare(`UPDATE usage_runs SET actual_cost_micros = MAX(?,
      actual_cost_micros + CASE WHEN ? AND actual_cost_micros = 0 THEN 0 ELSE ? END)
      WHERE id = ? AND status = 'running'`)
      .bind(
        Math.ceil(input.actualCostMicros),
        mightBeEmptyError ? 1 : 0,
        uncertainFloor,
        input.runId,
      ),
    db
      .prepare(`UPDATE chat_messages SET status = ?, content_tex = COALESCE(?, content_tex),
      steps_json = COALESCE(?, steps_json), agent_items_json = COALESCE(?, agent_items_json),
      suggestion = ?, error_message = ?, updated_at = ? WHERE id = (SELECT assistant_message_id ${running})`)
      .bind(
        input.messageStatus,
        input.contentTex ?? null,
        input.stepsJson ?? null,
        input.agentItemsJson ?? null,
        input.finalStatus === "done" ? (input.metadata?.suggestion ?? null) : null,
        input.errorMessage ?? null,
        nowMs,
        input.runId,
      ),
    db
      .prepare(`UPDATE chat_threads SET updated_at = ?, context_revision = context_revision + 1,
      generated_title = COALESCE(?, generated_title) WHERE id = (SELECT thread_id ${running})`)
      .bind(
        nowMs,
        input.finalStatus === "done" ? (input.metadata?.title ?? null) : null,
        input.runId,
      ),
    db
      .prepare(`INSERT INTO budget_hourly (hour_ts, global_actual_micros, guest_actual_micros, updated_at)
      SELECT created_at - created_at % ?, actual_cost_micros,
        CASE WHEN tier = 'guest' THEN actual_cost_micros ELSE 0 END, ? ${running}
      ON CONFLICT(hour_ts) DO UPDATE SET
        global_actual_micros = budget_hourly.global_actual_micros + excluded.global_actual_micros,
        guest_actual_micros = budget_hourly.guest_actual_micros + excluded.guest_actual_micros,
        updated_at = excluded.updated_at`)
      .bind(HOUR_MS, nowMs, input.runId),
    db
      .prepare(`UPDATE budget_reserves SET
      global_reserved_micros = MAX(0, global_reserved_micros - run.reserved_cost_micros),
      guest_reserved_micros = MAX(0, guest_reserved_micros -
        CASE WHEN run.tier = 'guest' THEN run.reserved_cost_micros ELSE 0 END),
      updated_at = ? FROM (SELECT tier, reserved_cost_micros ${running}) AS run
      WHERE budget_reserves.id = 1`)
      .bind(nowMs, input.runId),
    db
      .prepare(`UPDATE usage_runs SET status = ?, finished_at = ?, updated_at = ?,
      reserved_cost_micros = 0, is_cost_uncertain = MAX(is_cost_uncertain, ?),
      input_tokens = COALESCE(?, input_tokens), cached_tokens = COALESCE(?, cached_tokens),
      cache_write_tokens = COALESCE(?, cache_write_tokens), output_tokens = COALESCE(?, output_tokens),
      tool_rounds = COALESCE(?, tool_rounds), tool_calls = COALESCE(?, tool_calls), error_code = ?
      WHERE id = ? AND status = 'running'`)
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
        input.runId,
      ),
  ]);
  return result.at(-1)?.meta.changes === 1;
}

export async function sweepExpiredRuns(db: TrackedD1, nowMs: number): Promise<number> {
  const expired = await db.all<{ id: string; actual_cost_micros: number }>(
    db
      .prepare(
        "SELECT id, actual_cost_micros FROM usage_runs WHERE status = 'running' AND expires_at < ? LIMIT 10",
      )
      .bind(nowMs),
  );

  let swept = 0;
  for (const row of expired.results) {
    const ok = await finalizeRunAtomic(db, {
      runId: row.id,
      finalStatus: "error",
      messageStatus: "incomplete",
      errorCode: "run_expired",
      errorMessage: "Ответ не завершился вовремя. Попробуйте задать вопрос ещё раз.",
      actualCostMicros: row.actual_cost_micros,
      isCostUncertain: true,
      nowMs,
    });
    if (ok) swept += 1;
  }
  return swept;
}

// Used inside the write transaction for both initial reservations and top-ups.
const budgetFits = `global_reserved_micros + delta +
    (SELECT COALESCE(SUM(global_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) <= ?
    AND (NOT guest OR guest_reserved_micros + delta +
    (SELECT COALESCE(SUM(guest_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) <= ?)`;

function budgetLimits(policy: ServicePolicy, nowMs: number): number[] {
  return [
    hourBucketTs(nowMs - WEEK_MS),
    policy.budgets.weeklyGlobalUsdMicros,
    hourBucketTs(nowMs - DAY_MS),
    policy.budgets.dailyGuestUsdMicros,
  ];
}

/**
 * Light checkpoint after each completed LLM round (does not modify indexed columns)
 * plus reserve top-up if cumulative cost exceeds initial reserve.
 */
export async function checkpointRound(
  db: TrackedD1,
  policy: ServicePolicy,
  params: {
    runId: string;
    tier: Tier;
    bucket: QuotaBucket;
    currentReservedMicros: number;
    cumulativeActualMicros: number;
    inputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    toolRounds: number;
    toolCalls: number;
    nowMs: number;
  },
): Promise<{ updatedReservedMicros: number; canContinueToolRounds: boolean }> {
  const roundBuffer = Math.ceil(
    (params.bucket === "high"
      ? policy.budgets.reserveHighMicros
      : policy.budgets.reserveLowMicros) / 2,
  );
  const target = params.cumulativeActualMicros + roundBuffer;
  const progress = db
    .prepare(`UPDATE usage_runs SET
    actual_cost_micros = ?, input_tokens = ?, cached_tokens = ?, cache_write_tokens = ?,
    output_tokens = ?, tool_rounds = ?, tool_calls = ?, updated_at = ?
    WHERE id = ? AND status = 'running' AND actual_cost_micros <= ?`)
    .bind(
      params.cumulativeActualMicros,
      params.inputTokens,
      params.cachedTokens,
      params.cacheWriteTokens,
      params.outputTokens,
      params.toolRounds,
      params.toolCalls,
      params.nowMs,
      params.runId,
      params.cumulativeActualMicros,
    );

  const stmts = [progress];
  if (target > params.currentReservedMicros) {
    // Use the persisted reserve for the delta so replaying a checkpoint is free.
    stmts.push(
      db
        .prepare(`UPDATE budget_reserves SET global_reserved_micros = global_reserved_micros + delta,
        guest_reserved_micros = guest_reserved_micros + CASE WHEN guest THEN delta ELSE 0 END,
        updated_at = ? FROM (SELECT ? - reserved_cost_micros AS delta, tier = 'guest' AS guest
          FROM usage_runs WHERE id = ? AND status = 'running') WHERE budget_reserves.id = 1
        AND delta > 0 AND ${budgetFits}`)
        .bind(params.nowMs, target, params.runId, ...budgetLimits(policy, params.nowMs)),
      // changes() is the preceding reserve update in this transaction.
      db
        .prepare(`UPDATE usage_runs SET reserved_cost_micros = ?
        WHERE id = ? AND status = 'running' AND changes() = 1`)
        .bind(target, params.runId),
    );
  }
  stmts.push(
    db
      .prepare("SELECT reserved_cost_micros, status FROM usage_runs WHERE id = ?")
      .bind(params.runId),
  );
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

// =============================================================================
// Atomic admission + idempotency
// =============================================================================

export interface AdmitRunParams {
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "OWNER_TELEGRAM_ID" | "LLM_PROVIDER">;
  axes: IdentityAxes;
  clientRequestId: string;
  payloadHash: string;
  threadId: string | null;
  retryAssistantMessageId?: string | null;
  course: string;
  docId: string;
  questionText: string;
  quote: QuotePayload | null;
  nowMs?: number;
}

export type AdmitRunResult =
  | {
      kind: "admitted";
      contextLimited: boolean;
      preparedContext: PreparedTurnContext;
      questionCreatedAt: number;
      runId: string;
      threadId: string;
      threadTitle: string;
      generatedTitle: string | null;
      userMessageId: string;
      assistantMessageId: string;
      bucket: QuotaBucket;
      requestTitle: boolean;
      route: ModelRoute;
      reserveMicros: number;
      degraded: DegradedInfo;
    }
  | {
      kind: "duplicate";
      contextLimited: boolean;
      runId: string;
      threadId: string;
      threadTitle: string;
      generatedTitle: string | null;
      userMessageId: string;
      assistantMessageId: string;
      status: RunStatus;
      model: ModelId;
    }
  | {
      kind: "conflict";
      message: string;
    }
  | {
      kind: "blocked";
      block: BlockInfo;
      degraded: DegradedInfo;
    }
  | {
      kind: "not_found";
      message: string;
    };

function deriveThreadTitle(text: string, quote: QuotePayload | null): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return shortenThreadTitle(cleaned || quote?.label || "Новый чат");
}

function identityQuotaGuard(
  policy: ServicePolicy,
  axes: IdentityAxes,
  bucket: QuotaBucket,
  nowMs: number,
) {
  const guest = axes.tier === "guest" || axes.telegramId === null;
  const identifiers: [string, number | string][] = [["browser_id", axes.browserId]];
  if (guest) {
    identifiers.push(["ip_address", axes.ipAddress]);
    if (axes.fingerprint) identifiers.push(["fingerprint", axes.fingerprint]);
  } else {
    identifiers.push(["telegram_id", axes.telegramId!]);
  }
  const dailyLimit =
    bucket === "high"
      ? highQuotaLimit(policy, axes.tier)
      : policy.buckets.low.limits[guest ? "guest" : axes.tier];
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
      policy.rateLimitPerMinute,
      value,
      ...(separateBuckets ? [bucket] : []),
      nowMs - DAY_MS,
      dailyLimit,
    );
  }
  return { sql: clauses.join(" AND "), bindings };
}

export async function admitRunAtomic(
  db: TrackedD1,
  policy: ServicePolicy,
  params: AdmitRunParams,
): Promise<AdmitRunResult> {
  // A second transaction may have occupied the last slot after the preflight.
  // Re-evaluation returns its precise block or chooses the next available bucket.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryAdmitRun(db, policy, params);
    if (result.kind !== "reevaluate") return result;
  }
  return {
    kind: "conflict",
    message: "История чата изменилась. Попробуй отправить вопрос ещё раз.",
  };
}

async function tryAdmitRun(
  db: TrackedD1,
  policy: ServicePolicy,
  params: AdmitRunParams,
): Promise<AdmitRunResult | { kind: "reevaluate" }> {
  const nowMs = params.nowMs ?? Date.now();
  const isGuest = params.axes.tier === "guest" || params.axes.telegramId === null;
  const ownerKey = isGuest ? `br:${params.axes.browserId}` : `tg:${params.axes.telegramId}`;

  // 1. Check idempotency across both current owner_key and guest br:<browserId> (survives login!)
  const idempRow = isGuest
    ? await db.first<{
        id: string;
        payload_hash: string;
        thread_id: string;
        user_message_id: string;
        assistant_message_id: string;
        status: RunStatus;
        model: ModelId;
      }>(
        db
          .prepare(
            "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key = ? AND client_request_id = ?",
          )
          .bind(ownerKey, params.clientRequestId),
      )
    : await db.first<{
        id: string;
        payload_hash: string;
        thread_id: string;
        user_message_id: string;
        assistant_message_id: string;
        status: RunStatus;
        model: ModelId;
      }>(
        db
          .prepare(
            "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key IN (?, ?) AND client_request_id = ? LIMIT 1",
          )
          .bind(ownerKey, `br:${params.axes.browserId}`, params.clientRequestId),
      );

  if (idempRow) {
    // Verify current caller actually owns the duplicate's thread
    const thread = await db.first<{
      id: string;
      generated_title: string | null;
      title: string;
      context_limited: number;
      context_revision: number;
      browser_id: string | null;
      telegram_id: number | null;
    }>(
      db
        .prepare(
          "SELECT id, generated_title, title, context_limited, context_revision, browser_id, telegram_id FROM chat_threads WHERE id = ?",
        )
        .bind(idempRow.thread_id),
    );
    const ownsThread =
      thread &&
      (isGuest
        ? thread.browser_id === params.axes.browserId && thread.telegram_id === null
        : thread.telegram_id === params.axes.telegramId);
    if (!ownsThread || idempRow.payload_hash !== params.payloadHash) {
      return {
        kind: "conflict",
        message: "clientRequestId reused with different payload or thread",
      };
    }
    return {
      kind: "duplicate",
      contextLimited: Boolean(thread.context_limited),
      runId: idempRow.id,
      threadId: idempRow.thread_id,
      threadTitle: thread.generated_title ?? thread.title,
      generatedTitle: thread.generated_title,
      userMessageId: idempRow.user_message_id,
      assistantMessageId: idempRow.assistant_message_id,
      status: idempRow.status,
      model: idempRow.model,
    };
  }

  // 2. Sweep any expired running slots before evaluating limits
  await sweepExpiredRuns(db, nowMs);

  // 3. Evaluate budgets, quotas, concurrency & rate limits
  let evalRes = await evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, {
    checkConcurrency: true,
    checkRateLimit: true,
  });

  // 4. Verify existing thread ownership or prepare new thread
  let threadId = params.threadId;
  let threadTitle = deriveThreadTitle(params.questionText, params.quote);
  let generatedTitle: string | null = null;
  let nextSeq = 1;
  let creatingThread = false;
  let contextLimited = false;
  let contextRevision = 0;

  if (threadId) {
    const [threadRes, seqRes] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          "SELECT id, generated_title, title, context_limited, context_revision, browser_id, telegram_id FROM chat_threads WHERE id = ?",
        )
        .bind(threadId),
      db
        .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_messages WHERE thread_id = ?")
        .bind(threadId),
    ]);
    const thread = threadRes?.results[0] as
      | {
          id: string;
          generated_title: string | null;
          title: string;
          context_limited: number;
          context_revision: number;
          browser_id: string | null;
          telegram_id: number | null;
        }
      | undefined;

    const ownsThread =
      thread &&
      (isGuest
        ? thread.browser_id === params.axes.browserId && thread.telegram_id === null
        : thread.telegram_id === params.axes.telegramId);

    if (!ownsThread) {
      return {
        kind: "not_found",
        message: "Thread not found or not owned by user",
      };
    }
    contextLimited = Boolean(thread.context_limited);
    contextRevision = thread.context_revision;
    generatedTitle = thread.generated_title;
    threadTitle = generatedTitle ?? thread.title;
    nextSeq = Number(seqRes?.results[0]?.max_seq ?? 0) + 1;
  } else {
    creatingThread = true;
    threadId = `thr_${randomToken(12)}`;
  }

  const runId = `run_${randomToken(12)}`;
  let userMessageId = `msg_${randomToken(12)}`;
  let assistantMessageId = `msg_${randomToken(12)}`;
  let questionCreatedAt = nowMs;
  let retryAssistantSeq: number | null = null;
  const expiresAt = nowMs + policy.staleRunTimeoutMs;
  const quoteJson = params.quote ? JSON.stringify(params.quote) : null;

  if (params.retryAssistantMessageId) {
    const target = await db.first<{
      id: string;
      seq: number;
      user_id: string;
      created_at: number;
    }>(
      db
        .prepare(`SELECT assistant.id, assistant.seq, user.id AS user_id, user.created_at
        FROM chat_messages AS assistant JOIN chat_messages AS user
          ON user.thread_id = assistant.thread_id AND user.seq = assistant.seq - 1 AND user.role = 'user'
        WHERE assistant.thread_id = ? AND assistant.id = ? AND assistant.role = 'assistant'`)
        .bind(threadId, params.retryAssistantMessageId),
    );
    if (!target || target.seq !== nextSeq - 1) {
      return {
        kind: "conflict",
        message: "Only the latest assistant message can be retried",
      };
    }
    questionCreatedAt = target.created_at;
    userMessageId = target.user_id;
    assistantMessageId = target.id;
    retryAssistantSeq = target.seq;
  }

  const provider = params.env.LLM_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "codex";
  const prepare = (bucket: QuotaBucket) =>
    prepareTurnContext(db, {
      threadId: creatingThread ? null : threadId,
      retryAssistantMessageId: params.retryAssistantMessageId,
      course: params.course,
      docId: params.docId,
      questionText: params.questionText,
      quote: params.quote,
      createdAt: questionCreatedAt,
      generatedTitle,
      route: {
        provider,
        model: policy.buckets[bucket].model,
        effort: policy.buckets[bucket].effort,
      },
      limits: policy,
    });
  let preparedContext = await prepare(evalRes.bucket);
  if (
    !creatingThread &&
    (preparedContext.expectedMaxSeq !== nextSeq - 1 ||
      preparedContext.expectedContextRevision !== contextRevision)
  )
    return { kind: "reevaluate" };
  contextLimited ||= preparedContext.history.limitReached;
  if (contextLimited) {
    const candidateBucket = evalRes.bucket;
    evalRes = await evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, {
      forceLow: true,
    });
    if (candidateBucket !== "low") preparedContext = await prepare("low");
    if (
      !creatingThread &&
      (preparedContext.expectedMaxSeq !== nextSeq - 1 ||
        preparedContext.expectedContextRevision !== contextRevision)
    )
      return { kind: "reevaluate" };
  }
  // Only the final route determines whether its reservation fits and emits alerts.
  if (evalRes.weeklyWarnTriggered) {
    const pct = Math.round(
      ((evalRes.budget.globalActual7d + evalRes.budget.globalReserved) /
        policy.budgets.weeklyGlobalUsdMicros) *
        100,
    );
    await sendOwnerAlert(
      params.env,
      db,
      "lastWeeklyWarnAt",
      `Weekly budget reached ~${pct}% ($${((evalRes.budget.globalActual7d + evalRes.budget.globalReserved) / 1_000_000).toFixed(2)} / $${(policy.budgets.weeklyGlobalUsdMicros / 1_000_000).toFixed(2)}).`,
      nowMs,
    );
  }

  if (!evalRes.allowed && evalRes.block) {
    if (evalRes.block.code === "global_budget_exceeded") {
      await sendOwnerAlert(
        params.env,
        db,
        "lastWeeklyExceededAt",
        "Global 7-day budget limit exceeded! Chat requests are paused.",
        nowMs,
      );
    } else if (evalRes.block.code === "guest_budget_exceeded") {
      await sendOwnerAlert(
        params.env,
        db,
        "lastGuestExceededAt",
        "Guest 24-hour budget limit exceeded! Guests are prompted to sign in.",
        nowMs,
      );
    }
    return {
      kind: "blocked",
      block: evalRes.block,
      degraded: evalRes.degraded,
    };
  }

  const contextGuard = creatingThread
    ? "1"
    : `EXISTS (SELECT 1 FROM chat_threads WHERE id = ? AND context_revision = ?
    AND ? = (SELECT COALESCE(MAX(seq),0) FROM chat_messages WHERE thread_id = ?))`;
  const contextBindings = creatingThread
    ? []
    : [threadId, preparedContext.expectedContextRevision, preparedContext.expectedMaxSeq, threadId];

  // The run row gates every write in this transaction. A denied reservation
  // cannot leave behind a thread, messages, or a partially reset retry.
  const route = resolveModelRoute(policy.buckets[evalRes.bucket]);
  const quotaGuard = identityQuotaGuard(policy, params.axes, evalRes.bucket, nowMs);
  const threadGuard = creatingThread
    ? "1"
    : `EXISTS (
    SELECT 1 FROM chat_threads WHERE id = ?
      AND ${isGuest ? "telegram_id IS NULL AND browser_id = ?" : "telegram_id = ?"})`;
  const threadBindings = creatingThread
    ? []
    : [threadId, isGuest ? params.axes.browserId : params.axes.telegramId];
  const admitted = "EXISTS (SELECT 1 FROM usage_runs WHERE id = ?)";
  const insertStmts: D1PreparedStatement[] = [
    db
      .prepare(`INSERT INTO usage_runs (
      id, owner_key, client_request_id, payload_hash, thread_id, user_message_id, assistant_message_id,
      created_at, updated_at, expires_at, status, tier, quota_bucket, model, pricing_version, reasoning_effort,
      reserved_cost_micros, telegram_id, browser_id, ip_address, fingerprint, provider)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, delta, ?, ?, ?, ?, ?
      FROM budget_reserves, (SELECT ? AS delta, ? AS guest)
      WHERE id = 1 AND ${budgetFits} AND ${quotaGuard.sql} AND ${threadGuard} AND ${contextGuard}
        AND (? IS NULL OR ? = (SELECT MAX(seq) FROM chat_messages WHERE thread_id = ?))`)
      .bind(
        runId,
        ownerKey,
        params.clientRequestId,
        params.payloadHash,
        threadId,
        userMessageId,
        assistantMessageId,
        nowMs,
        nowMs,
        expiresAt,
        isGuest ? "guest" : params.axes.tier,
        evalRes.bucket,
        route.model,
        route.pricing_version,
        route.effort,
        isGuest ? null : params.axes.telegramId,
        params.axes.browserId,
        params.axes.ipAddress,
        params.axes.fingerprint,
        provider,
        evalRes.reserveMicros,
        isGuest ? 1 : 0,
        ...budgetLimits(policy, nowMs),
        ...quotaGuard.bindings,
        ...threadBindings,
        ...contextBindings,
        retryAssistantSeq,
        retryAssistantSeq,
        threadId,
      ),
  ];
  if (creatingThread) {
    insertStmts.push(
      db
        .prepare(
          `INSERT INTO chat_threads (id, title, browser_id, telegram_id, created_at, updated_at, context_limited, context_revision)
           SELECT ?, ?, ?, ?, ?, ?, ?, 1 WHERE ${admitted}`,
        )
        .bind(
          threadId,
          threadTitle,
          isGuest ? params.axes.browserId : null,
          isGuest ? null : params.axes.telegramId,
          nowMs,
          nowMs,
          contextLimited ? 1 : 0,
          runId,
        ),
    );
  } else {
    insertStmts.push(
      db
        .prepare(
          `UPDATE chat_threads SET updated_at = ?, context_revision = context_revision + 1, context_limited = MAX(context_limited, ?) WHERE id = ? AND ${admitted}`,
        )
        .bind(nowMs, contextLimited ? 1 : 0, threadId, runId),
    );
  }

  if (retryAssistantSeq !== null) {
    insertStmts.push(
      db
        .prepare(
          `UPDATE chat_messages
           SET status = 'running', content_tex = '', steps_json = NULL, agent_items_json = NULL, suggestion = NULL, error_message = NULL, run_id = ?, updated_at = ?
           WHERE id = ? AND ${admitted}`,
        )
        .bind(runId, nowMs, assistantMessageId, runId),
    );
  } else {
    insertStmts.push(
      db
        .prepare(
          `INSERT INTO chat_messages (id, thread_id, course, doc_id, seq, role, status, content_tex, quote_json, run_id, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, 'user', 'done', ?, ?, ?, ?, ? WHERE ${admitted}`,
        )
        .bind(
          userMessageId,
          threadId,
          params.course,
          params.docId,
          nextSeq,
          params.questionText,
          quoteJson,
          runId,
          nowMs,
          nowMs,
          runId,
        ),
      db
        .prepare(
          `INSERT INTO chat_messages (id, thread_id, course, doc_id, seq, role, status, content_tex, run_id, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, 'assistant', 'running', '', ?, ?, ? WHERE ${admitted}`,
        )
        .bind(
          assistantMessageId,
          threadId,
          params.course,
          params.docId,
          nextSeq + 1,
          runId,
          nowMs,
          nowMs,
          runId,
        ),
    );
  }

  insertStmts.push(
    db
      .prepare(`UPDATE chat_messages SET prompt_context_json = ? WHERE id = ? AND ${admitted}`)
      .bind(JSON.stringify(preparedContext.snapshot), userMessageId, runId),
  );
  insertStmts.push(
    db
      .prepare(
        `UPDATE budget_reserves
         SET global_reserved_micros = global_reserved_micros + ?,
             guest_reserved_micros = guest_reserved_micros + ?,
             updated_at = ?
         WHERE id = 1 AND ${admitted}`,
      )
      .bind(evalRes.reserveMicros, isGuest ? evalRes.reserveMicros : 0, nowMs, runId),
  );

  try {
    // Report a lost race using the same transaction snapshot.
    insertStmts.push(
      db
        .prepare(`SELECT CASE
      WHEN NOT ${threadGuard} THEN 'thread_changed'
      WHEN NOT ${contextGuard} THEN 'reevaluate'
      WHEN ? IS NOT NULL AND ? IS NOT (SELECT MAX(seq) FROM chat_messages WHERE thread_id = ?)
        THEN 'stale_retry'
      WHEN global_reserved_micros + ? +
        (SELECT COALESCE(SUM(global_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) > ?
        THEN 'global_budget_exceeded'
      WHEN ? AND guest_reserved_micros + ? +
        (SELECT COALESCE(SUM(guest_actual_micros), 0) FROM budget_hourly WHERE hour_ts >= ?) > ?
        THEN 'guest_budget_exceeded'
      ELSE 'reevaluate' END AS reason
      FROM budget_reserves WHERE id = 1 AND NOT ${admitted}`)
        .bind(
          ...threadBindings,
          ...contextBindings,
          retryAssistantSeq,
          retryAssistantSeq,
          threadId,
          evalRes.reserveMicros,
          hourBucketTs(nowMs - WEEK_MS),
          policy.budgets.weeklyGlobalUsdMicros,
          isGuest ? 1 : 0,
          evalRes.reserveMicros,
          hourBucketTs(nowMs - DAY_MS),
          policy.budgets.dailyGuestUsdMicros,
          runId,
        ),
    );
    const result = await db.batch<{
      reason:
        | "thread_changed"
        | "reevaluate"
        | "stale_retry"
        | "global_budget_exceeded"
        | "guest_budget_exceeded";
    }>(insertStmts);
    if (result[0]?.meta.changes !== 1) {
      const reason = result.at(-1)?.results[0]?.reason;
      if (!reason) throw new Error("Budget reserve row missing");
      if (reason === "thread_changed")
        return { kind: "not_found", message: "Thread ownership changed" };
      if (reason === "reevaluate") return { kind: "reevaluate" };
      if (reason === "stale_retry") {
        return {
          kind: "conflict",
          message: "Only the latest assistant message can be retried",
        };
      }
      return {
        kind: "blocked",
        block: { code: reason },
        degraded: evalRes.degraded,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("idx_usage_runs_active_thread") ||
      msg.includes("UNIQUE constraint failed: usage_runs.thread_id")
    ) {
      return {
        kind: "blocked",
        block: { code: "concurrent_run" },
        degraded: evalRes.degraded,
      };
    }
    if (
      msg.includes("idx_usage_runs_idempotency") ||
      msg.includes("UNIQUE constraint failed: usage_runs.owner_key")
    ) {
      return {
        kind: "conflict",
        message: "Concurrent duplicate clientRequestId",
      };
    }
    throw err;
  }

  return {
    kind: "admitted",
    contextLimited,
    preparedContext,
    questionCreatedAt,
    runId,
    threadId,
    threadTitle,
    generatedTitle,
    requestTitle: !generatedTitle,
    userMessageId,
    assistantMessageId,
    bucket: evalRes.bucket,
    route,
    reserveMicros: evalRes.reserveMicros,
    degraded: evalRes.degraded,
  };
}
