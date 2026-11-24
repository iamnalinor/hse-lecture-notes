import type { TrackedD1 } from "./db";
import type { AccountTier } from "./types";

export function accountTierFromValue(value: unknown): AccountTier {
  return value === "student" || value === "extended" ? value : "default";
}

export async function loadAccountTier(db: TrackedD1, telegramId: number): Promise<AccountTier> {
  const row = await db.first<{ tier: string }>(
    db.prepare("SELECT tier FROM telegram_account_tiers WHERE telegram_id = ?").bind(telegramId),
  );
  return accountTierFromValue(row?.tier);
}
