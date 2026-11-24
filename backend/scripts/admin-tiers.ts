import type { AccountTier } from "../src/types";

function telegramId(value: string): number {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Expected a positive safe integer Telegram ID");
  }
  return id;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function parseTelegramIds(content: string): number[] {
  const ids = [
    ...new Set(
      content
        .trim()
        .split(/[\s,;]+/)
        .map(telegramId),
    ),
  ];
  if (!ids.length) throw new Error("No Telegram IDs found");
  return ids;
}

export function assignmentSql(
  idValue: string,
  tierValue: string,
  now: number,
  note = "manual",
): string {
  const id = telegramId(idValue);
  if (!["default", "student", "extended"].includes(tierValue))
    throw new Error("Expected default, student or extended");
  const tier = tierValue as AccountTier;
  if (tier === "default") return `DELETE FROM telegram_account_tiers WHERE telegram_id = ${id};`;
  return `INSERT INTO telegram_account_tiers (telegram_id, tier, note, added_at, updated_at)
VALUES (${id}, ${sqlString(tier)}, ${sqlString(note)}, ${now}, ${now})
ON CONFLICT(telegram_id) DO UPDATE SET tier = excluded.tier, note = excluded.note, updated_at = excluded.updated_at;`;
}

export function rosterSql(ids: number[], now: number): string {
  if (!ids.length) throw new Error("No Telegram IDs found");
  const values = ids
    .map((id) => `(${telegramId(String(id))}, 'student', 'roster', ${now}, ${now})`)
    .join(",\n");
  return `DELETE FROM telegram_account_tiers WHERE tier = 'student' AND note = 'roster';
INSERT INTO telegram_account_tiers (telegram_id, tier, note, added_at, updated_at) VALUES ${values}
ON CONFLICT(telegram_id) DO NOTHING;`;
}
