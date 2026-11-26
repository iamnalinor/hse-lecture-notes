import type { TrackedD1 } from "../db";
import { sendOwnerAlert } from "../telegram-alerts";
import type { ServicePolicy } from "../types";
import type { AdmitRunParams, QuotaEvaluation } from "./types";

/** Tells the owner about budget milestones seen by an admission decision (each alert is rate-limited). */
export async function reportAdmissionAlerts(
  env: AdmitRunParams["env"],
  db: TrackedD1,
  policy: ServicePolicy,
  evalRes: QuotaEvaluation,
  nowMs: number,
): Promise<void> {
  // Only the final route determines whether its reservation fits and emits alerts.
  if (evalRes.weeklyWarnTriggered) {
    const pct = Math.round(
      ((evalRes.budget.globalActual7d + evalRes.budget.globalReserved) /
        policy.budgets.weeklyGlobalUsdMicros) *
        100,
    );
    await sendOwnerAlert(
      env,
      db,
      "lastWeeklyWarnAt",
      `Weekly budget reached ~${pct}% ($${((evalRes.budget.globalActual7d + evalRes.budget.globalReserved) / 1_000_000).toFixed(2)} / $${(policy.budgets.weeklyGlobalUsdMicros / 1_000_000).toFixed(2)}).`,
      nowMs,
    );
  }

  if (evalRes.block?.code === "global_budget_exceeded") {
    await sendOwnerAlert(
      env,
      db,
      "lastWeeklyExceededAt",
      "Global 7-day budget limit exceeded! Chat requests are paused.",
      nowMs,
    );
  } else if (evalRes.block?.code === "guest_budget_exceeded") {
    await sendOwnerAlert(
      env,
      db,
      "lastGuestExceededAt",
      "Guest 24-hour budget limit exceeded! Guests are prompted to sign in.",
      nowMs,
    );
  }
}
