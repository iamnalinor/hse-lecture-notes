import type { TrackedD1 } from "./db";
import type { Env, FetchLike } from "./types";

export type AlertKey =
  | "lastWeeklyWarnAt"
  | "lastWeeklyExceededAt"
  | "lastGuestExceededAt"
  | "lastOauthErrorAt";

interface AlertsState {
  lastWeeklyWarnAt: number;
  lastWeeklyExceededAt: number;
  lastGuestExceededAt: number;
  lastOauthErrorAt: number;
}

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

  const row = await db.first<{ value_json: string }>(
    db.prepare("SELECT value_json FROM service_config WHERE key = 'alerts_state'"),
  );
  const state: AlertsState = {
    lastWeeklyWarnAt: 0,
    lastWeeklyExceededAt: 0,
    lastGuestExceededAt: 0,
    lastOauthErrorAt: 0,
    ...(row ? (JSON.parse(row.value_json) as Partial<AlertsState>) : {}),
  };

  if (state[key] > 0 && nowMs - state[key] < ALERT_COOLDOWN_MS) {
    return false;
  }

  state[key] = nowMs;
  await db.run(
    db
      .prepare(
        "INSERT INTO service_config (key, value_json, updated_at) VALUES ('alerts_state', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      )
      .bind(JSON.stringify(state), nowMs),
  );

  try {
    const resp = await fetchImpl(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.OWNER_TELEGRAM_ID,
          text: `[hse-lecture-notes-api] ${message}`,
          disable_web_page_preview: true,
        }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}
