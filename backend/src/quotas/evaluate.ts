import type { TrackedD1 } from "../db";
import type { BlockInfo, DegradedInfo, QuotaBucket, ServicePolicy } from "../types";
import { budgetSnapshotStatements, parseBudgetSnapshot, readBudgetSnapshot } from "./budget-repo";
import { finalizeExpiredRuns } from "./finalize";
import { highQuotaLimit, isGuestAxes, lowQuotaLimit, reserveFor } from "./policy";
import { DAY_MS } from "./time";
import type {
  BudgetSnapshot,
  EvaluationOptions,
  ExpiredRun,
  IdentityAxes,
  QuotaEvaluation,
} from "./types";
import {
  activeRunCount,
  dayWindow,
  expiredByBrowser,
  expiredByFingerprint,
  expiredByIp,
  rateWindow,
  type CountColumn,
  type IdentityValue,
} from "./usage-repo";

interface AxisCount {
  cnt: number;
  oldest: number | null;
}

/** One identity dimension a request is counted on, with the suffix of its statement keys. */
interface Axis {
  suffix: "br" | "fp" | "ip" | "tg";
  column: CountColumn;
  value: IdentityValue;
}

type AxisKind = "rate" | "run" | "low" | "high";

/** Guests are counted by browser, IP and fingerprint; accounts by Telegram id and browser. */
function identityAxes(axes: IdentityAxes): Axis[] {
  if (isGuestAxes(axes)) {
    const guest: Axis[] = [
      { suffix: "br", column: "browser_id", value: axes.browserId },
      { suffix: "ip", column: "ip_address", value: axes.ipAddress },
    ];
    if (axes.fingerprint.length > 0) {
      guest.push({ suffix: "fp", column: "fingerprint", value: axes.fingerprint });
    }
    return guest;
  }
  return [
    { suffix: "tg", column: "telegram_id", value: axes.telegramId! },
    { suffix: "br", column: "browser_id", value: axes.browserId },
  ];
}

function axisKeys(kind: AxisKind, axes: Axis[]): string[] {
  return axes.map((axis) => `${kind}_${axis.suffix}`);
}

/** Per-axis statements appended after the budget statements; returns where each result will be. */
function planAxisQueries(
  db: TrackedD1,
  policy: ServicePolicy,
  identity: IdentityAxes,
  nowMs: number,
  checks: { concurrency: boolean; rateLimit: boolean },
  stmts: D1PreparedStatement[],
): Record<string, number> {
  const idx: Record<string, number> = {};
  const add = (name: string, stmt: D1PreparedStatement) => {
    idx[name] = stmts.length;
    stmts.push(stmt);
  };
  const axes = identityAxes(identity);
  const minCutoff = nowMs - 60_000;
  const dayCutoff = nowMs - DAY_MS;
  const lowLimit = lowQuotaLimit(policy, identity);
  const highLimit = highQuotaLimit(policy, identity.tier);

  if (checks.rateLimit) {
    for (const a of axes) {
      add(
        `rate_${a.suffix}`,
        rateWindow(db, a.column, a.value, minCutoff, policy.rateLimitPerMinute),
      );
    }
  }
  if (checks.concurrency) {
    for (const a of axes) add(`run_${a.suffix}`, activeRunCount(db, a.column, a.value, nowMs));
  }
  // 24h quota (low bucket): IP and fingerprint count runs of any bucket.
  for (const a of axes) {
    const bucket = a.column === "ip_address" || a.column === "fingerprint" ? null : "low";
    add(`low_${a.suffix}`, dayWindow(db, a.column, a.value, bucket, dayCutoff, lowLimit));
  }
  if (identity.tier === "student" || identity.tier === "extended") {
    for (const a of axes) {
      add(`high_${a.suffix}`, dayWindow(db, a.column, a.value, "high", dayCutoff, highLimit));
    }
  }
  return idx;
}

/** Reads the per-axis counts out of the batch results. */
function axisReader(results: D1Result<Record<string, unknown>>[], idx: Record<string, number>) {
  const getCount = (key: string): AxisCount => {
    const i = idx[key];
    if (i === undefined) return { cnt: 0, oldest: null };
    const row = results[i]?.results[0];
    return {
      cnt: Number(row?.cnt ?? 0),
      oldest: typeof row?.oldest === "number" ? row.oldest : null,
    };
  };

  /** The busiest axis; `oldest` is when every axis over its limit is back under it (the latest release). */
  const maxAxis = (keys: string[]): { count: number; oldest: number | null } => {
    let count = 0;
    let oldest: number | null = null;
    for (const k of keys) {
      const r = getCount(k);
      count = Math.max(count, r.cnt);
      if (r.oldest !== null) oldest = oldest === null ? r.oldest : Math.max(oldest, r.oldest);
    }
    return { count, oldest };
  };
  return { getCount, maxAxis };
}

type MaxAxis = ReturnType<typeof axisReader>["maxAxis"];

interface BucketDecision {
  bucket: QuotaBucket;
  degraded: DegradedInfo;
  quotaBlock: BlockInfo | null;
}

/** Picks the quota bucket and, when the daily quota is spent, the block with its release time. */
function decideBucket(
  policy: ServicePolicy,
  identity: IdentityAxes,
  axes: Axis[],
  options: EvaluationOptions,
  maxAxis: MaxAxis,
  nowMs: number,
): BucketDecision {
  const lowKeys = axisKeys("low", axes);
  const lowLimit = lowQuotaLimit(policy, identity);

  if (isGuestAxes(identity) || identity.tier === "default" || options.forceLow) {
    const low = maxAxis(lowKeys);
    const quotaBlock: BlockInfo | null =
      low.count >= lowLimit
        ? {
            code: isGuestAxes(identity) ? "auth_required" : "tier_quota_exceeded",
            nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS,
          }
        : null;
    return { bucket: "low", degraded: { active: false }, quotaBlock };
  }

  // Assigned account tiers have independent high and low quotas
  const high = maxAxis(axisKeys("high", axes));
  if (high.count < highQuotaLimit(policy, identity.tier)) {
    return { bucket: "high", degraded: { active: false }, quotaBlock: null };
  }
  const low = maxAxis(lowKeys);
  const degraded: DegradedInfo = {
    active: true,
    restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS,
  };
  if (low.count < lowLimit) return { bucket: "low", degraded, quotaBlock: null };
  const candidates = [high.oldest, low.oldest].filter((v): v is number => v !== null);
  const earliest = candidates.length > 0 ? Math.min(...candidates) : nowMs;
  return {
    bucket: "low",
    degraded,
    quotaBlock: { code: "tier_quota_exceeded", nextAvailableAt: earliest + DAY_MS },
  };
}

interface BudgetAssessment {
  weeklyWarnTriggered: boolean;
  budgetBlock: BlockInfo | null;
  /** Settling reservations of expired runs would bring the budget back under its limits. */
  recoverReserve: boolean;
}

function assessBudgets(
  policy: ServicePolicy,
  budget: BudgetSnapshot,
  isGuest: boolean,
  reserveMicros: number,
): BudgetAssessment {
  const globalProjected = budget.globalActual7d + budget.globalReserved + reserveMicros;
  const weeklyWarnTriggered =
    globalProjected >=
    Math.floor(policy.budgets.weeklyGlobalUsdMicros * policy.budgets.weeklyWarnRatio);

  const guestProjected = budget.guestActual24h + budget.guestReserved + reserveMicros;
  const globalBlocked = globalProjected > policy.budgets.weeklyGlobalUsdMicros;
  const guestBlocked = isGuest && guestProjected > policy.budgets.dailyGuestUsdMicros;
  const budgetBlock: BlockInfo | null = globalBlocked
    ? { code: "global_budget_exceeded" }
    : guestBlocked
      ? { code: "guest_budget_exceeded" }
      : null;
  // Even settling every reservation cannot help when actual usage already exhausts the budget.
  const recoverReserve =
    budgetBlock !== null &&
    budget.globalActual7d + reserveMicros <= policy.budgets.weeklyGlobalUsdMicros &&
    budget.guestActual24h + reserveMicros <= policy.budgets.dailyGuestUsdMicros;
  return { weeklyWarnTriggered, budgetBlock, recoverReserve };
}

/**
 * Settles the expired running runs of a blocked guest identity so their reservation and
 * quota slot are released. Looks only at the axes that are actually at their limit
 * (or at all of them, when the block is the budget).
 */
async function settleExpiredGuestRuns(
  db: TrackedD1,
  identity: IdentityAxes,
  axes: Axis[],
  getCount: (key: string) => AxisCount,
  lowLimit: number,
  recoverReserve: boolean,
  nowMs: number,
): Promise<void> {
  const dayCutoff = nowMs - DAY_MS;
  const candidates: D1PreparedStatement[] = [];
  const blocked = (key: string) => recoverReserve || getCount(key).cnt >= lowLimit;
  if (blocked("low_br"))
    candidates.push(expiredByBrowser(db, identity.browserId, nowMs, dayCutoff));
  if (blocked("low_ip")) candidates.push(expiredByIp(db, identity.ipAddress, nowMs, dayCutoff));
  if (axes.some((axis) => axis.suffix === "fp") && blocked("low_fp")) {
    candidates.push(expiredByFingerprint(db, identity.fingerprint, nowMs, dayCutoff));
  }
  const matches = await db.batch<ExpiredRun>(candidates);
  const unique = new Map(matches.flatMap((page) => page.results).map((row) => [row.id, row]));
  await finalizeExpiredRuns(db, [...unique.values()].slice(0, 10), nowMs);
}

export async function evaluateQuotasAndBudgets(
  db: TrackedD1,
  policy: ServicePolicy,
  identity: IdentityAxes,
  nowMs: number,
  options: EvaluationOptions = {},
): Promise<QuotaEvaluation> {
  const checkConcurrency = options.checkConcurrency ?? true;
  const checkRateLimit = options.checkRateLimit ?? true;
  const isGuest = isGuestAxes(identity);

  if (isGuest && policy.requireLoginWithoutFingerprint && !identity.fingerprint) {
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

  // One consolidated D1.batch() for budgets + rate limits + active runs + daily buckets
  const axes = identityAxes(identity);
  const stmts = budgetSnapshotStatements(db, nowMs);
  const idx = planAxisQueries(
    db,
    policy,
    identity,
    nowMs,
    { concurrency: checkConcurrency, rateLimit: checkRateLimit },
    stmts,
  );
  const results = await db.batch<Record<string, unknown>>(stmts);
  const budget = parseBudgetSnapshot(results);
  const { getCount, maxAxis } = axisReader(results, idx);

  const { bucket, degraded, quotaBlock } = decideBucket(
    policy,
    identity,
    axes,
    options,
    maxAxis,
    nowMs,
  );
  const reserveMicros = reserveFor(policy, bucket);
  const { weeklyWarnTriggered, budgetBlock, recoverReserve } = assessBudgets(
    policy,
    budget,
    isGuest,
    reserveMicros,
  );
  const evaluation = (block: BlockInfo | null): QuotaEvaluation => ({
    allowed: block === null,
    bucket,
    reserveMicros,
    degraded,
    block,
    weeklyWarnTriggered,
    budget,
  });

  if (
    isGuest &&
    options.recoverExpiredGuestQuota !== false &&
    (recoverReserve || (!budgetBlock && quotaBlock))
  ) {
    await settleExpiredGuestRuns(
      db,
      identity,
      axes,
      getCount,
      lowQuotaLimit(policy, identity),
      recoverReserve,
      nowMs,
    );
    // A concurrent finalizer can win between the count and the lookup, leaving zero matches.
    return evaluateQuotasAndBudgets(db, policy, identity, nowMs, {
      ...options,
      recoverExpiredGuestQuota: false,
    });
  }
  const block = budgetBlock ?? quotaBlock;
  if (block) return evaluation(block);

  // Check active concurrency (1 running)
  if (checkConcurrency && maxAxis(axisKeys("run", axes)).count >= 1) {
    return evaluation({ code: "concurrent_run" });
  }

  // Check per-minute rate limit
  if (checkRateLimit) {
    const rate = maxAxis(axisKeys("rate", axes));
    if (rate.count >= policy.rateLimitPerMinute) {
      const retryAfterSec = rate.oldest
        ? Math.max(1, Math.ceil((rate.oldest + 60_000 - nowMs) / 1000))
        : 15;
      return evaluation({ code: "rate_limited", retryAfterSec });
    }
  }

  return evaluation(null);
}
