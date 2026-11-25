import type { TrackedD1 } from "./db";
import type { Env, FetchLike } from "./types";

export type AlertKey =
  | "lastWeeklyWarnAt"
  | "lastWeeklyExceededAt"
  | "lastGuestExceededAt"
  | "lastOauthErrorAt";

const DELIVERY_LEASE_MS = 60_000;
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function sendOwnerAlert(
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "OWNER_TELEGRAM_ID">,
  db: TrackedD1,
  key: AlertKey,
  message: string,
  nowMs = Date.now(),
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.OWNER_TELEGRAM_ID) return false;

  const sentPath = `$.${key}`;
  const leasePath = `$.${key}Lease`;
  const claim = await db.run(db.prepare(`
    INSERT INTO service_config (key, value_json, updated_at) VALUES ('alerts_state', json_object(?, ?), ?)
    ON CONFLICT(key) DO UPDATE SET value_json = json_set(value_json, ?, ?), updated_at = excluded.updated_at
    WHERE COALESCE(json_extract(value_json, ?), 0) <= ?
      AND (COALESCE(json_extract(value_json, ?), 0) = 0 OR json_extract(value_json, ?) <= ?)
  `).bind(key + "Lease", nowMs + DELIVERY_LEASE_MS, nowMs, leasePath, nowMs + DELIVERY_LEASE_MS,
    leasePath, nowMs, sentPath, sentPath, nowMs - ALERT_COOLDOWN_MS));
  if (claim.meta.changes !== 1) return false;
  let delivered = false;
  try {
    const resp = await fetchImpl(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.OWNER_TELEGRAM_ID,
          text: `[hse-lecture-notes-api] ${message}`,
          disable_web_page_preview: true,
        }),
      },
    );
    delivered = resp.ok && (await resp.json() as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
  if (delivered) {
    await db.run(db.prepare(`UPDATE service_config SET value_json = json_set(json_remove(value_json, ?), ?, ?), updated_at = ?
      WHERE key = 'alerts_state' AND json_extract(value_json, ?) = ?`)
      .bind(leasePath, sentPath, nowMs, nowMs, leasePath, nowMs + DELIVERY_LEASE_MS));
  }
  return delivered;
}
