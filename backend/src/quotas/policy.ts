import type { TrackedD1 } from "../db";
import type { QuotaBucket, ServicePolicy, Tier } from "../types";
import type { IdentityAxes } from "./types";

export async function loadPolicy(db: TrackedD1): Promise<ServicePolicy> {
  const row = await db.first<{ value_json: string }>(
    db.prepare("SELECT value_json FROM service_config WHERE key = 'policy'"),
  );
  if (!row) throw new Error("Service policy is missing. Run init-db.");
  return JSON.parse(row.value_json) as ServicePolicy;
}

/** A request without an account (or from the guest tier) is limited by browser, IP and fingerprint. */
export function isGuestAxes(axes: IdentityAxes): boolean {
  return axes.tier === "guest" || axes.telegramId === null;
}

export function highQuotaLimit(policy: ServicePolicy, tier: Tier): number {
  return tier === "student" || tier === "extended" ? policy.buckets.high.limits[tier] : 0;
}

export function lowQuotaLimit(policy: ServicePolicy, axes: IdentityAxes): number {
  return policy.buckets.low.limits[isGuestAxes(axes) ? "guest" : axes.tier];
}

export function dailyLimit(policy: ServicePolicy, axes: IdentityAxes, bucket: QuotaBucket): number {
  return bucket === "high" ? highQuotaLimit(policy, axes.tier) : lowQuotaLimit(policy, axes);
}

export function reserveFor(policy: ServicePolicy, bucket: QuotaBucket): number {
  return bucket === "high" ? policy.budgets.reserveHighMicros : policy.budgets.reserveLowMicros;
}

export type { Tier };
