import {
  mintBrowserToken,
  normalizeIpAddress,
  randomToken,
  signHs256Jwt,
  verifyBrowserToken,
  verifyHs256Jwt,
  verifyRs256JwtWithJwks,
  type JwksDocument,
} from "./crypto";
import type { TrackedD1 } from "./db";
import { evaluateQuotasAndBudgets, loadPolicy } from "./quotas";
import type {
  AllowanceJwtPayload,
  Env,
  SessionJwtPayload,
  Tier,
} from "./types";

const BROWSER_COOKIE_NAME = "browser_token";
const NONCE_TTL_MS = 5 * 60_000;
const MIGRATION_IDEMPOTENCY_WINDOW_MS = 10 * 60_000;

let cachedJwks: { doc: JwksDocument; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 10 * 60_000;

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function makeBrowserTokenCookie(browserToken: string, isSecure = true): string {
  const attrs = [
    `${BROWSER_COOKIE_NAME}=${encodeURIComponent(browserToken)}`,
    "Max-Age=31536000",
    "Path=/",
    "HttpOnly",
  ];
  if (isSecure) {
    attrs.push("Secure", "SameSite=None", "Partitioned");
  } else {
    attrs.push("SameSite=Lax");
  }
  return attrs.join("; ");
}

export type BrowserTokenCheck =
  | {
      status: "ok";
      browserId: string;
      browserToken: string;
      needsCookieSync: boolean;
      needsStorageSync: boolean;
    }
  | { status: "mismatch" }
  | { status: "missing" };

/**
 * 2-copy browserToken contract:
 *  - Copy 1: HttpOnly worker-domain cookie `browser_token`
 *  - Copy 2: SPA localStorage sent via `X-Browser-Token` (or body/WS frame)
 * If both are validly signed and differ -> mismatch (409).
 * If one is missing and the other is valid -> ok + backfill signal.
 */
export async function resolveBrowserToken(
  secret: string,
  cookieHeader: string | null,
  storageToken: string | null | undefined,
): Promise<BrowserTokenCheck> {
  const cookies = parseCookieHeader(cookieHeader);
  const cookieRaw = cookies[BROWSER_COOKIE_NAME] ?? null;

  const [cookieVerified, storageVerified] = await Promise.all([
    verifyBrowserToken(secret, cookieRaw),
    verifyBrowserToken(secret, storageToken ?? null),
  ]);

  if (cookieVerified && storageVerified) {
    if (cookieVerified.browserId !== storageVerified.browserId) {
      return { status: "mismatch" };
    }
    return {
      status: "ok",
      browserId: cookieVerified.browserId,
      browserToken: cookieVerified.browserToken,
      needsCookieSync: false,
      needsStorageSync: false,
    };
  }

  if (cookieVerified) {
    return {
      status: "ok",
      browserId: cookieVerified.browserId,
      browserToken: cookieVerified.browserToken,
      needsCookieSync: false,
      needsStorageSync: true,
    };
  }

  if (storageVerified) {
    return {
      status: "ok",
      browserId: storageVerified.browserId,
      browserToken: storageVerified.browserToken,
      needsCookieSync: true,
      needsStorageSync: false,
    };
  }

  return { status: "missing" };
}

export interface VerifiedSession {
  sessionId: string;
  telegramId: number;
  telegramName: string;
  tier: "internal" | "external";
}

export async function verifyActiveSession(
  env: Pick<Env, "ALLOWANCE_JWT_SECRET">,
  db: TrackedD1,
  sessionToken: string | null | undefined,
  nowMs = Date.now(),
): Promise<VerifiedSession | null> {
  const payload = await verifyHs256Jwt<SessionJwtPayload>(
    env.ALLOWANCE_JWT_SECRET,
    sessionToken,
    nowMs,
  );
  if (!payload || payload.typ !== "session" || !payload.sid || typeof payload.tgId !== "number") {
    return null;
  }

  const [sessRes, internalRes] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT id, telegram_id, telegram_name, expires_at, revoked_at FROM user_sessions WHERE id = ?",
      )
      .bind(payload.sid),
    db
      .prepare("SELECT telegram_id FROM internal_telegram_accounts WHERE telegram_id = ?")
      .bind(payload.tgId),
  ]);

  const row = sessRes?.results[0] as
    | { id: string; telegram_id: number; telegram_name: string; expires_at: number; revoked_at: number | null }
    | undefined;
  if (!row || row.revoked_at !== null || row.expires_at <= nowMs || row.telegram_id !== payload.tgId) {
    return null;
  }

  const isInternal = Boolean(internalRes?.results[0]);
  return {
    sessionId: row.id,
    telegramId: row.telegram_id,
    telegramName: row.telegram_name,
    tier: isInternal ? "internal" : "external",
  };
}

export async function verifyAllowanceToken(
  env: Pick<Env, "ALLOWANCE_JWT_SECRET">,
  db: TrackedD1,
  allowanceToken: string | null | undefined,
  expectedBrowserId: string,
  nowMs = Date.now(),
): Promise<AllowanceJwtPayload | null> {
  const payload = await verifyHs256Jwt<AllowanceJwtPayload>(
    env.ALLOWANCE_JWT_SECRET,
    allowanceToken,
    nowMs,
  );
  if (!payload || payload.typ !== "allowance" || payload.browserId !== expectedBrowserId) {
    return null;
  }

  // If this allowance was minted for a logged-in session, verify that the session hasn't been revoked
  if (payload.sid) {
    const sess = await db.first<{ revoked_at: number | null; expires_at: number }>(
      db
        .prepare("SELECT revoked_at, expires_at FROM user_sessions WHERE id = ?")
        .bind(payload.sid),
    );
    if (!sess || sess.revoked_at !== null || sess.expires_at <= nowMs) {
      return null;
    }
  }

  return payload;
}

export interface TurnstileVerifyResult {
  ok: boolean;
  reason?: string;
}

export async function verifyTurnstileToken(
  env: Pick<Env, "TURNSTILE_SECRET_KEY" | "TURNSTILE_EXPECTED_HOSTNAMES">,
  token: string,
  remoteIp: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerifyResult> {
  if (!token || token.length > 2048) {
    return { ok: false, reason: "missing_turnstile_token" };
  }

  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: remoteIp,
  });

  const resp = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!resp.ok) {
    return { ok: false, reason: `siteverify_http_${resp.status}` };
  }

  const data = (await resp.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
    "error-codes"?: string[];
  };

  if (!data.success) {
    return { ok: false, reason: (data["error-codes"] ?? ["turnstile_failed"]).join(",") };
  }

  const allowedHosts = new Set(
    env.TURNSTILE_EXPECTED_HOSTNAMES.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  // Cloudflare dummy test keys return hostname "example.com" — only check when non-empty
  if (data.hostname && allowedHosts.size > 0 && !allowedHosts.has(data.hostname.toLowerCase())) {
    return { ok: false, reason: `unexpected_hostname:${data.hostname}` };
  }

  if (data.action && data.action !== "chat_allowance") {
    return { ok: false, reason: `unexpected_action:${data.action}` };
  }

  return { ok: true };
}

async function loadTelegramJwks(
  jwksUrl: string,
  fetchImpl: typeof fetch,
  nowMs: number,
  forceRefresh = false,
): Promise<JwksDocument> {
  if (!forceRefresh && cachedJwks && nowMs - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.doc;
  }
  const resp = await fetchImpl(jwksUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Telegram JWKS (${resp.status})`);
  }
  const doc = (await resp.json()) as JwksDocument;
  cachedJwks = { doc, fetchedAt: nowMs };
  return doc;
}

export interface TelegramIdClaims {
  iss?: string;
  aud?: string | number | Array<string | number>;
  exp?: number;
  id?: number | string;
  name?: string;
  preferred_username?: string;
  nonce?: string;
  [key: string]: unknown;
}

export async function verifyTelegramIdToken(
  env: Pick<Env, "TELEGRAM_JWKS_URL" | "TELEGRAM_ISSUER" | "TELEGRAM_CLIENT_ID">,
  idToken: string,
  nowMs = Date.now(),
  fetchImpl: typeof fetch = fetch,
  jwksOverride?: JwksDocument,
): Promise<{ telegramId: number; telegramName: string; nonce: string } | null> {
  let claims: TelegramIdClaims | null = null;
  if (jwksOverride) {
    claims = await verifyRs256JwtWithJwks<TelegramIdClaims>(idToken, jwksOverride);
  } else {
    const jwks = await loadTelegramJwks(env.TELEGRAM_JWKS_URL, fetchImpl, nowMs, false);
    claims = await verifyRs256JwtWithJwks<TelegramIdClaims>(idToken, jwks);
    if (!claims) {
      const freshJwks = await loadTelegramJwks(env.TELEGRAM_JWKS_URL, fetchImpl, nowMs, true);
      claims = await verifyRs256JwtWithJwks<TelegramIdClaims>(idToken, freshJwks);
    }
  }
  if (!claims) return null;

  if (claims.iss !== env.TELEGRAM_ISSUER) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) return null;

  if (env.TELEGRAM_CLIENT_ID) {
    const expectedAud = String(env.TELEGRAM_CLIENT_ID);
    const audList = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? "")];
    if (!audList.includes(expectedAud)) return null;
  }

  // Match strictly on numeric claim `id` (NOT `sub`)
  const rawId = claims.id;
  const telegramId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId)
        ? Number(rawId)
        : NaN;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;

  if (typeof claims.nonce !== "string" || claims.nonce.length < 12) return null;

  const telegramName =
    (typeof claims.name === "string" && claims.name.trim()) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username.trim()) ||
    `User ${telegramId}`;

  return { telegramId, telegramName, nonce: claims.nonce };
}

// =============================================================================
// Endpoint handlers
// =============================================================================

export async function handleCreateNonce(
  env: Env,
  db: TrackedD1,
  request: Request,
  nowMs = Date.now(),
): Promise<{ status: number; body: Record<string, unknown>; setCookie?: string }> {
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token"),
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }
  if (btCheck.status === "missing") {
    return { status: 401, body: { code: "browser_token_required", message: "Call /v1/allowance first" } };
  }

  const nonce = randomToken(24);
  const expiresAt = nowMs + NONCE_TTL_MS;

  await db.batch([
    // Bounded cleanup of expired nonces using idx_auth_nonces_expires
    db
      .prepare(
        "DELETE FROM auth_nonces WHERE rowid IN (SELECT rowid FROM auth_nonces WHERE expires_at < ? LIMIT 50)",
      )
      .bind(nowMs),
    db
      .prepare("INSERT INTO auth_nonces (nonce, browser_id, expires_at) VALUES (?, ?, ?)")
      .bind(nonce, btCheck.browserId, expiresAt),
  ]);

  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      nonce,
      expiresAt,
      ...(btCheck.needsStorageSync ? { browserToken: btCheck.browserToken } : {}),
    },
    ...(btCheck.needsCookieSync
      ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) }
      : {}),
  };
}

export async function handleTelegramLogin(
  env: Env,
  db: TrackedD1,
  request: Request,
  body: { telegramIdToken?: string },
  options: { nowMs?: number; fetchImpl?: typeof fetch; jwksOverride?: JwksDocument } = {},
): Promise<{ status: number; body: Record<string, unknown>; setCookie?: string }> {
  const nowMs = options.nowMs ?? Date.now();
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token"),
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }
  if (btCheck.status === "missing") {
    return { status: 401, body: { code: "browser_token_required", message: "Browser token required" } };
  }

  if (!body.telegramIdToken || typeof body.telegramIdToken !== "string") {
    return { status: 400, body: { code: "missing_telegram_token", message: "telegramIdToken required" } };
  }

  const verified = await verifyTelegramIdToken(
    env,
    body.telegramIdToken,
    nowMs,
    options.fetchImpl ?? fetch,
    options.jwksOverride,
  );
  if (!verified) {
    return { status: 401, body: { code: "invalid_telegram_token", message: "Invalid Telegram ID token" } };
  }

  // ALWAYS consume nonce atomically (no client flag can ever bypass this!)
  const consumeRes = await db.run(
    db
      .prepare(
        `UPDATE auth_nonces
         SET consumed_at = ?
         WHERE nonce = ? AND browser_id = ? AND consumed_at IS NULL AND expires_at > ?`,
      )
      .bind(nowMs, verified.nonce, btCheck.browserId, nowMs),
  );
  if ((consumeRes.meta?.changes ?? 0) !== 1) {
    return { status: 401, body: { code: "invalid_or_reused_nonce", message: "Nonce invalid, expired, or already used" } };
  }

  const policy = await loadPolicy(db);
  const internalRow = await db.first<{ telegram_id: number }>(
    db
      .prepare("SELECT telegram_id FROM internal_telegram_accounts WHERE telegram_id = ?")
      .bind(verified.telegramId),
  );
  const tier: Tier = internalRow ? "internal" : "external";

  const sessionId = `sess_${randomToken(18)}`;
  const expiresAt = nowMs + policy.sessionTtlMs;

  const sessionToken = await signHs256Jwt<SessionJwtPayload>(env.ALLOWANCE_JWT_SECRET, {
    typ: "session",
    sid: sessionId,
    tgId: verified.telegramId,
    tgName: verified.telegramName,
    browserId: btCheck.browserId,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(expiresAt / 1000),
  });

  // Coordinated migration in one D1.batch():
  // 1. Insert user_sessions
  // 2. Migrate guest chat_threads to telegram_id
  // 3. Migrate active `running` usage_runs to telegram_id (so other devices see active run)
  // 4. Migrate recent owner_key (last 10 min) so clientRequestId retries stay idempotent
  const tgOwnerKey = `tg:${verified.telegramId}`;
  const brOwnerKey = `br:${btCheck.browserId}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_sessions (id, telegram_id, telegram_name, browser_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(sessionId, verified.telegramId, verified.telegramName, btCheck.browserId, nowMs, expiresAt),
    db
      .prepare(
        `UPDATE chat_threads
         SET telegram_id = ?, browser_id = NULL, updated_at = ?
         WHERE browser_id = ? AND telegram_id IS NULL`,
      )
      .bind(verified.telegramId, nowMs, btCheck.browserId),
    db
      .prepare(
        `UPDATE usage_runs
         SET telegram_id = ?, updated_at = ?
         WHERE browser_id = ? AND telegram_id IS NULL AND status = 'running'`,
      )
      .bind(verified.telegramId, nowMs, btCheck.browserId),
    db
      .prepare(
        `UPDATE usage_runs
         SET owner_key = ?, updated_at = ?
         WHERE owner_key = ? AND created_at >= ?
           AND NOT EXISTS (
             SELECT 1 FROM usage_runs u2
             WHERE u2.owner_key = ? AND u2.client_request_id = usage_runs.client_request_id
           )`,
      )
      .bind(tgOwnerKey, nowMs, brOwnerKey, nowMs - MIGRATION_IDEMPOTENCY_WINDOW_MS, tgOwnerKey),
  ]);

  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      sessionToken,
      browserToken: btCheck.browserToken,
      tier,
      user: { id: verified.telegramId, name: verified.telegramName },
      expiresAt,
    },
    ...(btCheck.needsCookieSync
      ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) }
      : {}),
  };
}

export async function handleLogout(
  env: Env,
  db: TrackedD1,
  sessionToken: string | null | undefined,
  nowMs = Date.now(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const payload = await verifyHs256Jwt<SessionJwtPayload>(
    env.ALLOWANCE_JWT_SECRET,
    sessionToken,
    nowMs,
  );
  if (payload?.sid) {
    await db.run(
      db
        .prepare("UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
        .bind(nowMs, payload.sid),
    );
  }
  return { status: 200, body: { ok: true } };
}

export async function handleAllowance(
  env: Env,
  db: TrackedD1,
  request: Request,
  body: {
    turnstileToken?: string;
    sessionToken?: string;
    browserToken?: string;
    fingerprint?: string;
  },
  options: {
    nowMs?: number;
    turnstileVerifier?: (token: string, ip: string) => Promise<TurnstileVerifyResult>;
  } = {},
): Promise<{ status: number; body: Record<string, unknown>; setCookie?: string }> {
  const nowMs = options.nowMs ?? Date.now();
  const ipAddress = normalizeIpAddress(
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For"),
  );
  const fingerprint =
    typeof body.fingerprint === "string" ? body.fingerprint.trim().slice(0, 128) : "";

  const storageToken = body.browserToken ?? request.headers.get("X-Browser-Token");
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    storageToken,
  );

  if (btCheck.status === "mismatch") {
    return {
      status: 409,
      body: { code: "browser_token_mismatch", message: "Cookie and localStorage browser tokens differ" },
    };
  }

  // Turnstile verification is always required to issue a fresh 30-min allowanceToken (and to mint a new browserToken)
  const verifier =
    options.turnstileVerifier ??
    ((tok: string, ip: string) => verifyTurnstileToken(env, tok, ip));

  const tsResult = await verifier(body.turnstileToken ?? "", ipAddress);
  if (!tsResult.ok) {
    return {
      status: 403,
      body: {
        code: "turnstile_failed",
        message: "Turnstile verification failed",
        reason: tsResult.reason,
      },
    };
  }

  let browserId: string;
  let browserToken: string;
  let setCookieNeeded = false;

  if (btCheck.status === "missing") {
    const minted = await mintBrowserToken(env.BROWSER_TOKEN_SECRET);
    browserId = minted.browserId;
    browserToken = minted.browserToken;
    setCookieNeeded = true;
  } else {
    browserId = btCheck.browserId;
    browserToken = btCheck.browserToken;
    setCookieNeeded = btCheck.needsCookieSync;
  }

  // Resolve optional authenticated session
  const session = await verifyActiveSession(env, db, body.sessionToken, nowMs);
  const tier: Tier = session ? session.tier : "guest";

  const policy = await loadPolicy(db);
  const allowanceExpMs = nowMs + policy.allowanceTtlMs;

  const allowanceToken = await signHs256Jwt<AllowanceJwtPayload>(env.ALLOWANCE_JWT_SECRET, {
    typ: "allowance",
    browserId,
    ...(session ? { sid: session.sessionId, tgId: session.telegramId, tgName: session.telegramName } : {}),
    tier,
    ip: ipAddress,
    fp: fingerprint,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(allowanceExpMs / 1000),
  });

  // Informational quota/budget check (does not check 1-minute burst or reserve budget)
  const evalRes = await evaluateQuotasAndBudgets(
    db,
    policy,
    {
      tier,
      telegramId: session?.telegramId ?? null,
      browserId,
      ipAddress,
      fingerprint,
    },
    nowMs,
    { checkConcurrency: false, checkRateLimit: false },
  );

  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      browserToken,
      allowanceToken,
      allowanceExpiresAt: allowanceExpMs,
      tier,
      user: session ? { id: session.telegramId, name: session.telegramName } : null,
      degraded: evalRes.degraded,
      block: evalRes.block,
    },
    ...(setCookieNeeded ? { setCookie: makeBrowserTokenCookie(browserToken, isSecure) } : {}),
  };
}
