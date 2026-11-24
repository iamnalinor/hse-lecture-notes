import {
  decodeJwtUnverified,
  decryptJsonAesGcm,
  encryptJsonAesGcm,
  randomToken,
} from "./crypto";
import type { TrackedD1 } from "./db";
import { sendOwnerAlert } from "./telegram-alerts";
import type { Env, FetchLike } from "./types";

export interface CodexCredentialsPayload {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: number; // ms epoch
}

interface CodexCredentialsRow {
  id: number;
  version: number;
  encrypted_payload: string;
  status: string;
  lease_owner: string | null;
  lease_until: number;
  updated_at: number;
}

const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const LEASE_TTL_MS = 20_000;
const WAIT_FOR_LEASE_MAX_MS = 6_000;
const WAIT_POLL_MS = 250;

export class CodexAuthError extends Error {
  readonly code: "oauth_unavailable" | "oauth_needs_reauth";

  constructor(code: "oauth_unavailable" | "oauth_needs_reauth", message: string) {
    super(message);
    this.code = code;
  }
}

export function extractChatGptAccountId(accessToken: string): string | null {
  const parsed = decodeJwtUnverified<Record<string, unknown>>(accessToken);
  if (!parsed) return null;
  const authClaim = parsed.payload["https://api.openai.com/auth"] as
    | Record<string, unknown>
    | undefined;
  if (authClaim && typeof authClaim.chatgpt_account_id === "string" && authClaim.chatgpt_account_id) {
    return authClaim.chatgpt_account_id;
  }
  if (typeof parsed.payload.chatgpt_account_id === "string" && parsed.payload.chatgpt_account_id) {
    return parsed.payload.chatgpt_account_id;
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getValidCodexCredentials(
  env: Pick<
    Env,
    | "CODEX_CREDENTIALS_ENCRYPTION_KEY"
    | "CODEX_OAUTH_CLIENT_ID"
    | "CODEX_TOKEN_URL"
    | "TELEGRAM_BOT_TOKEN"
    | "OWNER_TELEGRAM_ID"
  >,
  db: TrackedD1,
  options: { forceRefresh?: boolean; now?: () => number; fetchImpl?: FetchLike } = {},
): Promise<CodexCredentialsPayload> {
  const now = options.now ?? (() => Date.now());
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  const row = await db.first<CodexCredentialsRow>(
    db.prepare("SELECT * FROM codex_credentials WHERE id = 1"),
  );
  if (!row) {
    throw new CodexAuthError("oauth_needs_reauth", "codex_credentials table is not seeded");
  }
  if (row.status === "needs_reauth") {
    throw new CodexAuthError("oauth_needs_reauth", "Codex OAuth credentials require re-authentication");
  }

  const creds = await decryptJsonAesGcm<CodexCredentialsPayload>(
    env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
    row.encrypted_payload,
  );

  const needsRefresh =
    options.forceRefresh ||
    !creds.accessToken ||
    !creds.accountId ||
    creds.expiresAt <= now() + REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return creds;
  }

  return refreshWithLease(env, db, row, creds, now, fetchImpl);
}

async function refreshWithLease(
  env: Pick<
    Env,
    | "CODEX_CREDENTIALS_ENCRYPTION_KEY"
    | "CODEX_OAUTH_CLIENT_ID"
    | "CODEX_TOKEN_URL"
    | "TELEGRAM_BOT_TOKEN"
    | "OWNER_TELEGRAM_ID"
  >,
  db: TrackedD1,
  initialRow: CodexCredentialsRow,
  initialCreds: CodexCredentialsPayload,
  now: () => number,
  fetchImpl: FetchLike,
): Promise<CodexCredentialsPayload> {
  const leaseOwner = `lease_${randomToken(12)}`;
  const startNow = now();

  const acquireRes = await db.run(
    db
      .prepare(
        `UPDATE codex_credentials
         SET lease_owner = ?, lease_until = ?, updated_at = ?
         WHERE id = 1
           AND version = ?
           AND status = 'ok'
           AND (lease_until < ? OR lease_owner IS NULL)`,
      )
      .bind(leaseOwner, startNow + LEASE_TTL_MS, startNow, initialRow.version, startNow),
  );

  const acquired = (acquireRes.meta?.changes ?? 0) === 1;

  if (!acquired) {
    // Another worker/DO holds the refresh lease: wait for version bump
    const deadline = now() + WAIT_FOR_LEASE_MAX_MS;
    while (now() < deadline) {
      await sleep(WAIT_POLL_MS);
      const latest = await db.first<CodexCredentialsRow>(
        db.prepare("SELECT * FROM codex_credentials WHERE id = 1"),
      );
      if (!latest) break;
      if (latest.status === "needs_reauth") {
        throw new CodexAuthError("oauth_needs_reauth", "Codex OAuth credentials require re-authentication");
      }
      if (latest.version > initialRow.version) {
        return decryptJsonAesGcm<CodexCredentialsPayload>(
          env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
          latest.encrypted_payload,
        );
      }
      if (latest.lease_until < now()) {
        // Previous lease expired, retry once cleanly
        const latestCreds = await decryptJsonAesGcm<CodexCredentialsPayload>(
          env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
          latest.encrypted_payload,
        );
        return refreshWithLease(env, db, latest, latestCreds, now, fetchImpl);
      }
    }
    throw new CodexAuthError("oauth_unavailable", "Timed out waiting for Codex OAuth refresh lease");
  }

  // We own the lease: perform OAuth token exchange
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: initialCreds.refreshToken,
      client_id: env.CODEX_OAUTH_CLIENT_ID,
    });

    const resp = await fetchImpl(env.CODEX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const isTerminal =
        resp.status === 400 ||
        resp.status === 401 ||
        errText.includes("invalid_grant") ||
        errText.includes("refresh_token_reused");

      if (isTerminal) {
        await db.run(
          db
            .prepare(
              `UPDATE codex_credentials
               SET status = 'needs_reauth', lease_owner = NULL, lease_until = 0, updated_at = ?
               WHERE id = 1 AND lease_owner = ?`,
            )
            .bind(now(), leaseOwner),
        );
        await sendOwnerAlert(
          env,
          db,
          "lastOauthErrorAt",
          `Codex OAuth refresh failed permanently (${resp.status}). Re-seed refresh_token via scripts/admin.ts.`,
          now(),
          fetchImpl,
        );
        throw new CodexAuthError(
          "oauth_needs_reauth",
          `Codex OAuth refresh failed permanently (${resp.status})`,
        );
      }

      // Transient error: release lease without changing status
      await db.run(
        db
          .prepare(
            `UPDATE codex_credentials
             SET lease_owner = NULL, lease_until = 0, updated_at = ?
             WHERE id = 1 AND lease_owner = ?`,
          )
          .bind(now(), leaseOwner),
      );
      throw new CodexAuthError("oauth_unavailable", `Codex OAuth transient failure (${resp.status})`);
    }

    const tokenJson = (await resp.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenJson.access_token) {
      throw new CodexAuthError("oauth_unavailable", "Codex OAuth response missing access_token");
    }

    const accountId =
      extractChatGptAccountId(tokenJson.access_token) || initialCreds.accountId || "";

    const updatedCreds: CodexCredentialsPayload = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token || initialCreds.refreshToken,
      accountId,
      expiresAt: now() + Math.max(60, tokenJson.expires_in ?? 3600) * 1000,
    };

    const encrypted = await encryptJsonAesGcm(env.CODEX_CREDENTIALS_ENCRYPTION_KEY, updatedCreds);

    await db.run(
      db
        .prepare(
          `UPDATE codex_credentials
           SET version = version + 1,
               encrypted_payload = ?,
               status = 'ok',
               lease_owner = NULL,
               lease_until = 0,
               updated_at = ?
           WHERE id = 1 AND version = ? AND lease_owner = ?`,
        )
        .bind(encrypted, now(), initialRow.version, leaseOwner),
    );

    return updatedCreds;
  } catch (err) {
    if (err instanceof CodexAuthError) throw err;
    await db.run(
      db
        .prepare(
          `UPDATE codex_credentials
           SET lease_owner = NULL, lease_until = 0, updated_at = ?
           WHERE id = 1 AND lease_owner = ?`,
        )
        .bind(now(), leaseOwner),
    );
    throw new CodexAuthError(
      "oauth_unavailable",
      `Codex OAuth refresh network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
