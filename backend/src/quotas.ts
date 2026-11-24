import { randomToken } from "./crypto";
import type { TrackedD1 } from "./db";
import { estimateUncertainRoundCostMicros, PRICING_VERSION } from "./pricing";
import { sendOwnerAlert } from "./telegram-alerts";
import {
  DEFAULT_POLICY,
  type BlockInfo,
  type DegradedInfo,
  type Env,
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
  if (!row) return DEFAULT_POLICY;
  try {
    const parsed = JSON.parse(row.value_json) as Partial<ServicePolicy>;
    return {
      ...DEFAULT_POLICY,
      ...parsed,
      budgets: { ...DEFAULT_POLICY.budgets, ...(parsed.budgets ?? {}) },
      tiers: {
        guest: { ...DEFAULT_POLICY.tiers.guest, ...(parsed.tiers?.guest ?? {}) },
        external: { ...DEFAULT_POLICY.tiers.external, ...(parsed.tiers?.external ?? {}) },
        internal: { ...DEFAULT_POLICY.tiers.internal, ...(parsed.tiers?.internal ?? {}) },
      },
    };
  } catch {
    return DEFAULT_POLICY;
  }
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
  model: ModelId;
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
  options: { checkConcurrency?: boolean; checkRateLimit?: boolean } = {},
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
      model: "gpt-6-luna",
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

    if (axes.tier === "internal") {
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

  // Determine bucket, model & degraded state first
  let bucket: QuotaBucket = "low";
  let model: ModelId = "gpt-6-luna";
  let degraded: DegradedInfo = { active: false };
  let quotaBlock: BlockInfo | null = null;

  if (isGuest) {
    const lowKeys = useFp ? ["low_br", "low_ip", "low_fp"] : ["low_br", "low_ip"];
    const low = maxAxis(lowKeys);
    if (low.count >= policy.tiers.guest.lowLimit) {
      quotaBlock = {
        code: "auth_required",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
      };
    }
  } else if (axes.tier === "external") {
    const low = maxAxis(["low_tg", "low_br"]);
    if (low.count >= policy.tiers.external.lowLimit) {
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
      };
    }
  } else {
    // internal: independent high (20 Terra) and low (80 Luna) buckets
    const high = maxAxis(["high_tg", "high_br"]);
    const low = maxAxis(["low_tg", "low_br"]);
    if (high.count < policy.tiers.internal.highLimit) {
      bucket = "high";
      model = "gpt-6.1-terra";
      degraded = { active: false };
    } else if (low.count < policy.tiers.internal.lowLimit) {
      bucket = "low";
      model = "gpt-6-luna";
      degraded = {
        active: true,
        restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS,
      };
    } else {
      bucket = "low";
      model = "gpt-6-luna";
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
    globalProjected >= Math.floor(policy.budgets.weeklyGlobalUsdMicros * policy.budgets.weeklyWarnRatio);

  // Check global 7d budget
  if (globalProjected > policy.budgets.weeklyGlobalUsdMicros) {
    return {
      allowed: false,
      bucket,
      model,
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
        model,
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
      model,
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
        model,
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
        model,
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
    model,
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
  errorMessage?: string | null;
  errorCode?: string | null;
  actualCostMicros: number;
  isCostUncertain: boolean;
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
export async function finalizeRunAtomic(
  db: TrackedD1,
  input: FinalizeRunInput,
): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const existing = await db.first<{
    id: string;
    status: string;
    tier: Tier;
    model: ModelId;
    thread_id: string;
    assistant_message_id: string;
    reserved_cost_micros: number;
    actual_cost_micros: number;
    created_at: number;
  }>(
    db
      .prepare(
        "SELECT id, status, tier, model, thread_id, assistant_message_id, reserved_cost_micros, actual_cost_micros, created_at FROM usage_runs WHERE id = ?",
      )
      .bind(input.runId),
  );

  if (!existing || existing.status !== "running") {
    return false;
  }

  let finalCostMicros = Math.max(existing.actual_cost_micros, Math.ceil(input.actualCostMicros));
  const zeroOutputError =
    input.finalStatus === "error" &&
    input.errorCode !== "run_expired" &&
    finalCostMicros === 0 &&
    (input.toolRounds ?? 0) === 0 &&
    (input.streamedOutputChars ?? (input.contentTex?.length ?? 0)) === 0;
  if (input.isCostUncertain && !zeroOutputError) {
    const uncertainFloor = estimateUncertainRoundCostMicros(
      existing.model,
      input.estimatedPromptChars ?? 6000,
      input.streamedOutputChars ?? (input.contentTex?.length ?? 0),
    );
    finalCostMicros = Math.max(finalCostMicros, existing.actual_cost_micros + uncertainFloor);
  }

  // Step 1: guarded CAS on usage_runs
  const casRes = await db.run(
    db
      .prepare(
        `UPDATE usage_runs
         SET status = ?,
             finished_at = ?,
             updated_at = ?,
             reserved_cost_micros = 0,
             actual_cost_micros = ?,
             is_cost_uncertain = CASE WHEN ? = 1 THEN 1 ELSE is_cost_uncertain END,
             input_tokens = COALESCE(?, input_tokens),
             cached_tokens = COALESCE(?, cached_tokens),
             cache_write_tokens = COALESCE(?, cache_write_tokens),
             output_tokens = COALESCE(?, output_tokens),
             tool_rounds = COALESCE(?, tool_rounds),
             tool_calls = COALESCE(?, tool_calls),
             error_code = ?
         WHERE id = ? AND status = 'running'`,
      )
      .bind(
        input.finalStatus,
        nowMs,
        nowMs,
        finalCostMicros,
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
  );

  if ((casRes.meta?.changes ?? 0) !== 1) {
    return false;
  }

  // Step 2: we won the CAS — atomically update message, thread, budget_hourly, and release budget_reserves
  const hourTs = hourBucketTs(existing.created_at);
  const isGuest = existing.tier === "guest";
  const guestDelta = isGuest ? finalCostMicros : 0;
  const guestReserveRelease = isGuest ? existing.reserved_cost_micros : 0;

  const postStmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE chat_messages
         SET status = ?,
             content_tex = COALESCE(?, content_tex),
             steps_json = COALESCE(?, steps_json),
             agent_items_json = COALESCE(?, agent_items_json),
             error_message = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.messageStatus,
        input.contentTex ?? null,
        input.stepsJson ?? null,
        input.agentItemsJson ?? null,
        input.errorMessage ?? null,
        nowMs,
        existing.assistant_message_id,
      ),
    db
      .prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?")
      .bind(nowMs, existing.thread_id),
    db
      .prepare(
        `INSERT INTO budget_hourly (hour_ts, global_actual_micros, guest_actual_micros, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(hour_ts) DO UPDATE SET
           global_actual_micros = budget_hourly.global_actual_micros + excluded.global_actual_micros,
           guest_actual_micros = budget_hourly.guest_actual_micros + excluded.guest_actual_micros,
           updated_at = excluded.updated_at`,
      )
      .bind(hourTs, finalCostMicros, guestDelta, nowMs),
    db
      .prepare(
        `UPDATE budget_reserves
         SET global_reserved_micros = MAX(0, global_reserved_micros - ?),
             guest_reserved_micros = MAX(0, guest_reserved_micros - ?),
             updated_at = ?
         WHERE id = 1`,
      )
      .bind(existing.reserved_cost_micros, guestReserveRelease, nowMs),
  ];

  await db.batch(postStmts);
  return true;
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
  let updatedReservedMicros = params.currentReservedMicros;
  let canContinueToolRounds = true;

  // Always persist non-indexed cost & token progress for this completed round
  await db.run(
    db
      .prepare(
        `UPDATE usage_runs
         SET actual_cost_micros = ?,
             input_tokens = ?,
             cached_tokens = ?,
             cache_write_tokens = ?,
             output_tokens = ?,
             tool_rounds = ?,
             tool_calls = ?,
             updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
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
      ),
  );

  // If actual spend is approaching/exceeding reserve, check remaining budget and top up reserve
  const roundBuffer =
    params.bucket === "high"
      ? Math.ceil(policy.budgets.reserveHighMicros / 2)
      : Math.ceil(policy.budgets.reserveLowMicros / 2);

  if (params.cumulativeActualMicros + roundBuffer > params.currentReservedMicros) {
    const budget = await readBudgetSnapshot(db, params.nowMs);
    const delta = params.cumulativeActualMicros + roundBuffer - params.currentReservedMicros;
    const isGuest = params.tier === "guest";
    const globalOk =
      budget.globalActual7d + budget.globalReserved + delta <= policy.budgets.weeklyGlobalUsdMicros;
    const guestOk =
      !isGuest ||
      budget.guestActual24h + budget.guestReserved + delta <= policy.budgets.dailyGuestUsdMicros;

    if (!globalOk || !guestOk) {
      canContinueToolRounds = false;
    } else {
      updatedReservedMicros = params.currentReservedMicros + delta;
      await db.batch([
        db
          .prepare(
            "UPDATE usage_runs SET reserved_cost_micros = ?, updated_at = ? WHERE id = ? AND status = 'running'",
          )
          .bind(updatedReservedMicros, params.nowMs, params.runId),
        db
          .prepare(
            `UPDATE budget_reserves
             SET global_reserved_micros = global_reserved_micros + ?,
                 guest_reserved_micros = guest_reserved_micros + ?,
                 updated_at = ?
             WHERE id = 1`,
          )
          .bind(delta, isGuest ? delta : 0, params.nowMs),
      ]);
    }
  }

  return { updatedReservedMicros, canContinueToolRounds };
}

// =============================================================================
// Atomic admission + idempotency
// =============================================================================

export interface AdmitRunParams {
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "OWNER_TELEGRAM_ID">;
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
      runId: string;
      threadId: string;
      threadTitle: string;
      userMessageId: string;
      assistantMessageId: string;
      bucket: QuotaBucket;
      model: ModelId;
      reserveMicros: number;
      degraded: DegradedInfo;
    }
  | {
      kind: "duplicate";
      runId: string;
      threadId: string;
      threadTitle: string;
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
  if (cleaned.length > 0) {
    return cleaned.length > 72 ? `${cleaned.slice(0, 71).trimEnd()}…` : cleaned;
  }
  if (quote?.label) {
    return quote.label.length > 72 ? `${quote.label.slice(0, 71).trimEnd()}…` : quote.label;
  }
  return "Новый чат";
}

export async function admitRunAtomic(
  db: TrackedD1,
  policy: ServicePolicy,
  params: AdmitRunParams,
): Promise<AdmitRunResult> {
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
    const thread = await db.first<{ id: string; title: string; browser_id: string | null; telegram_id: number | null }>(
      db
        .prepare("SELECT id, title, browser_id, telegram_id FROM chat_threads WHERE id = ?")
        .bind(idempRow.thread_id),
    );
    const ownsThread =
      thread &&
      (isGuest
        ? thread.browser_id === params.axes.browserId && thread.telegram_id === null
        : thread.telegram_id === params.axes.telegramId);
    if (!ownsThread || idempRow.payload_hash !== params.payloadHash) {
      return { kind: "conflict", message: "clientRequestId reused with different payload or thread" };
    }
    return {
      kind: "duplicate",
      runId: idempRow.id,
      threadId: idempRow.thread_id,
      threadTitle: thread.title,
      userMessageId: idempRow.user_message_id,
      assistantMessageId: idempRow.assistant_message_id,
      status: idempRow.status,
      model: idempRow.model,
    };
  }

  // 2. Sweep any expired running slots before evaluating limits
  await sweepExpiredRuns(db, nowMs);

  // 3. Evaluate budgets, quotas, concurrency & rate limits
  const evalRes = await evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, {
    checkConcurrency: true,
    checkRateLimit: true,
  });

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
    return { kind: "blocked", block: evalRes.block, degraded: evalRes.degraded };
  }

  // 4. Verify existing thread ownership or prepare new thread
  let threadId = params.threadId;
  let threadTitle = deriveThreadTitle(params.questionText, params.quote);
  let nextSeq = 1;
  let creatingThread = false;

  if (threadId) {
    const [threadRes, seqRes] = await db.batch<Record<string, unknown>>([
      db
        .prepare("SELECT id, title, course, doc_id, browser_id, telegram_id FROM chat_threads WHERE id = ?")
        .bind(threadId),
      db
        .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_messages WHERE thread_id = ?")
        .bind(threadId),
    ]);
    const thread = threadRes?.results[0] as
      | { id: string; title: string; course: string; doc_id: string; browser_id: string | null; telegram_id: number | null }
      | undefined;

    const ownsThread =
      thread &&
      (isGuest
        ? thread.browser_id === params.axes.browserId && thread.telegram_id === null
        : thread.telegram_id === params.axes.telegramId);

    if (!ownsThread) {
      return { kind: "not_found", message: "Thread not found or not owned by user" };
    }
    threadTitle = thread.title;
    nextSeq = Number(seqRes?.results[0]?.max_seq ?? 0) + 1;
  } else {
    creatingThread = true;
    threadId = `thr_${randomToken(12)}`;
  }

  const runId = `run_${randomToken(12)}`;
  let userMessageId = `msg_${randomToken(12)}`;
  let assistantMessageId = `msg_${randomToken(12)}`;
  let retryAssistantSeq: number | null = null;
  const expiresAt = nowMs + policy.staleRunTimeoutMs;
  const quoteJson = params.quote ? JSON.stringify(params.quote) : null;

  if (!creatingThread && params.retryAssistantMessageId) {
    const retryTarget = await db.first<{ id: string; seq: number; role: string }>(
      db
        .prepare("SELECT id, seq, role FROM chat_messages WHERE id = ? AND thread_id = ?")
        .bind(params.retryAssistantMessageId, threadId),
    );
    if (retryTarget && retryTarget.role === "assistant") {
      const prevUser = await db.first<{ id: string }>(
        db
          .prepare(
            "SELECT id FROM chat_messages WHERE thread_id = ? AND seq < ? AND role = 'user' ORDER BY seq DESC LIMIT 1",
          )
          .bind(threadId, retryTarget.seq),
      );
      if (prevUser) {
        userMessageId = prevUser.id;
        assistantMessageId = retryTarget.id;
        retryAssistantSeq = retryTarget.seq;
      }
    }
  }

  const insertStmts: D1PreparedStatement[] = [];
  if (creatingThread) {
    insertStmts.push(
      db
        .prepare(
          `INSERT INTO chat_threads (id, course, doc_id, title, browser_id, telegram_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          threadId,
          params.course,
          params.docId,
          threadTitle,
          isGuest ? params.axes.browserId : null,
          isGuest ? null : params.axes.telegramId,
          nowMs,
          nowMs,
        ),
    );
  } else {
    insertStmts.push(
      db
        .prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?")
        .bind(nowMs, threadId),
    );
  }

  if (retryAssistantSeq !== null) {
    insertStmts.push(
      db
        .prepare("DELETE FROM chat_messages WHERE thread_id = ? AND seq > ?")
        .bind(threadId, retryAssistantSeq),
      db
        .prepare(
          `UPDATE chat_messages
           SET status = 'running', content_tex = '', steps_json = NULL, agent_items_json = NULL, error_message = NULL, run_id = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(runId, nowMs, assistantMessageId),
    );
  } else {
    insertStmts.push(
      db
        .prepare(
          `INSERT INTO chat_messages (id, thread_id, seq, role, status, content_tex, quote_json, run_id, created_at, updated_at)
           VALUES (?, ?, ?, 'user', 'done', ?, ?, ?, ?, ?)`,
        )
        .bind(userMessageId, threadId, nextSeq, params.questionText, quoteJson, runId, nowMs, nowMs),
      db
        .prepare(
          `INSERT INTO chat_messages (id, thread_id, seq, role, status, content_tex, run_id, created_at, updated_at)
           VALUES (?, ?, ?, 'assistant', 'running', '', ?, ?, ?)`,
        )
        .bind(assistantMessageId, threadId, nextSeq + 1, runId, nowMs, nowMs),
    );
  }

  insertStmts.push(
    db
      .prepare(
        `INSERT INTO usage_runs (
           id, owner_key, client_request_id, payload_hash, thread_id, user_message_id, assistant_message_id,
           created_at, updated_at, expires_at, status, tier, quota_bucket, model, pricing_version,
           reserved_cost_micros, telegram_id, browser_id, ip_address, fingerprint
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
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
        params.axes.tier,
        evalRes.bucket,
        evalRes.model,
        PRICING_VERSION,
        evalRes.reserveMicros,
        isGuest ? null : params.axes.telegramId,
        params.axes.browserId,
        params.axes.ipAddress,
        params.axes.fingerprint,
      ),
    db
      .prepare(
        `UPDATE budget_reserves
         SET global_reserved_micros = global_reserved_micros + ?,
             guest_reserved_micros = guest_reserved_micros + ?,
             updated_at = ?
         WHERE id = 1`,
      )
      .bind(evalRes.reserveMicros, isGuest ? evalRes.reserveMicros : 0, nowMs),
  );

  try {
    await db.batch(insertStmts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("idx_usage_runs_active_thread") || msg.includes("UNIQUE constraint failed: usage_runs.thread_id")) {
      return { kind: "blocked", block: { code: "concurrent_run" }, degraded: evalRes.degraded };
    }
    if (msg.includes("idx_usage_runs_idempotency") || msg.includes("UNIQUE constraint failed: usage_runs.owner_key")) {
      return { kind: "conflict", message: "Concurrent duplicate clientRequestId" };
    }
    throw err;
  }

  return {
    kind: "admitted",
    runId,
    threadId,
    threadTitle,
    userMessageId,
    assistantMessageId,
    bucket: evalRes.bucket,
    model: evalRes.model,
    reserveMicros: evalRes.reserveMicros,
    degraded: evalRes.degraded,
  };
}
