import {
  mintBrowserToken,
  bytesToBase64Url,
  decodeJwtUnverified,
  normalizeIpAddress,
  signHs256Jwt,
  verifyBrowserToken,
  verifyHs256Jwt,
  verifyRs256JwtWithJwks,
  type JwksDocument,
} from "./crypto";
import type { TrackedD1 } from "./db";
import { loadAccountTier } from "./account-tiers";
import { evaluateQuotasAndBudgets, loadPolicy } from "./quotas";
import type {
  AllowanceJwtPayload,
  Env,
  SessionJwtPayload,
  Tier,
} from "./types";

const MIGRATION_IDEMPOTENCY_WINDOW_MS = 10 * 60_000;

const jwksCache = new Map<string, { doc: Promise<JwksDocument>; fetchedAt: number }>();
const JWKS_CACHE_TTL_MS = 10 * 60_000;

export type BrowserTokenCheck =
  | { status: "ok"; browserId: string; browserToken: string }
  | { status: "missing" };

/** Verifies only the signed token explicitly sent by the SPA from localStorage. */
export async function resolveBrowserToken(
  secret: string,
  storageToken: string | null | undefined,
): Promise<BrowserTokenCheck> {
  const verified = await verifyBrowserToken(secret, storageToken ?? null);
  return verified ? { status: "ok", ...verified } : { status: "missing" };
}

export interface VerifiedSession {
  expiresAt: number;
  telegramId: number;
  telegramName: string;
}

export async function verifyActiveSession(
  env: Pick<Env, "ALLOWANCE_JWT_SECRET">,
  sessionToken: string | null | undefined,
  expectedBrowserId: string,
  nowMs = Date.now(),
): Promise<VerifiedSession | null> {
  const payload = await verifyHs256Jwt<SessionJwtPayload>(
    env.ALLOWANCE_JWT_SECRET,
    sessionToken,
    nowMs,
  );
  if (!payload || payload.typ !== "session_v2" || payload.browserId !== expectedBrowserId ||
      !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.tgId) || payload.tgId <= 0 ||
      typeof payload.tgName !== "string" || !payload.tgName.trim()) {
    return null;
  }
  return {
    telegramId: payload.tgId,
    telegramName: payload.tgName,
    expiresAt: payload.exp * 1000,
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
  if (!payload || payload.browserId !== expectedBrowserId || !Number.isSafeInteger(payload.exp)) {
    return null;
  }
  if (payload.typ === "allowance") {
    // Pre-migration authenticated allowances had a revocable sid. Only guest tokens carry over.
    return payload.tier === "guest" && !("sid" in payload) && !("tgId" in payload) && !("tgName" in payload)
      ? payload : null;
  }
  if (payload.typ !== "account_allowance_v2" || typeof payload.tgId !== "number" ||
      !Number.isSafeInteger(payload.tgId) || payload.tgId <= 0) {
    return null;
  }
  return { ...payload, tier: await loadAccountTier(db, payload.tgId) };
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
    ...(remoteIp ? { remoteip: remoteIp } : {}),
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
): Promise<JwksDocument> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && nowMs - cached.fetchedAt < JWKS_CACHE_TTL_MS) return cached.doc;
  const doc = fetchImpl(jwksUrl).then(async (resp) => {
    if (!resp.ok) throw new Error(`Failed to fetch Telegram JWKS (${resp.status})`);
    return await resp.json() as JwksDocument;
  });
  jwksCache.set(jwksUrl, { doc, fetchedAt: nowMs });
  try {
    return await doc;
  } catch (error) {
    if (jwksCache.get(jwksUrl)?.doc === doc) jwksCache.delete(jwksUrl);
    throw error;
  }
}

export interface TelegramIdClaims {
  iss?: string;
  aud?: string | number | Array<string | number>;
  exp?: number;
  id?: number | string;
  name?: string;
  preferred_username?: string;
  [key: string]: unknown;
}

export async function verifyTelegramIdToken(
  env: Pick<Env, "TELEGRAM_JWKS_URL" | "TELEGRAM_ISSUER" | "TELEGRAM_CLIENT_ID">,
  idToken: string,
  nowMs = Date.now(),
  fetchImpl: typeof fetch = fetch,
  jwksOverride?: JwksDocument,
): Promise<{ telegramId: number; telegramName: string; expiresAt: number } | null> {
  const expectedAud = env.TELEGRAM_CLIENT_ID?.trim();
  const parsed = decodeJwtUnverified<TelegramIdClaims>(idToken);
  const claims = parsed?.payload;
  if (!expectedAud || parsed?.header?.alg !== "RS256" || !claims) return null;
  if (claims.iss !== env.TELEGRAM_ISSUER) return null;
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp * 1000) || claims.exp * 1000 <= nowMs) return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some(aud => (typeof aud === "number" || typeof aud === "string") && String(aud) === expectedAud)) {
    return null;
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

  // JWT signatures use unpadded base64url.
  if (idToken !== `${parsed.signingInput}.${bytesToBase64Url(parsed.signature)}`) return null;

  // Reject malformed claims locally. Only a verified signature can authorize login.
  const jwks = jwksOverride ?? await loadTelegramJwks(env.TELEGRAM_JWKS_URL, fetchImpl, nowMs);
  if (!await verifyRs256JwtWithJwks<TelegramIdClaims>(idToken, jwks)) return null;

  const telegramName =
    (typeof claims.name === "string" && claims.name.trim()) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username.trim()) ||
    `User ${telegramId}`;

  return { telegramId, telegramName, expiresAt: claims.exp * 1000 };
}

// =============================================================================
// Endpoint handlers
// =============================================================================

export async function handleTelegramLogin(
  env: Env,
  db: TrackedD1,
  request: Request,
  body: { telegramIdToken?: string },
  options: { nowMs?: number; fetchImpl?: typeof fetch; jwksOverride?: JwksDocument } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowMs = options.nowMs ?? Date.now();
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("X-Browser-Token"),
  );
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

  const policy = await loadPolicy(db);
  const tier = await loadAccountTier(db, verified.telegramId);

  const exp = Math.floor((nowMs + policy.sessionTtlMs) / 1000);

  const sessionToken = await signHs256Jwt<SessionJwtPayload>(env.ALLOWANCE_JWT_SECRET, {
    typ: "session_v2",
    tgId: verified.telegramId,
    tgName: verified.telegramName,
    browserId: btCheck.browserId,
    iat: Math.floor(nowMs / 1000),
    exp,
  });

  // Claim guest threads, running requests and recent retry keys in one transaction.
  const tgOwnerKey = `tg:${verified.telegramId}`;
  const brOwnerKey = `br:${btCheck.browserId}`;
  if (verified.expiresAt <= Date.now()) {
    return { status: 401, body: { code: "invalid_telegram_token", message: "Expired Telegram ID token" } };
  }
  await db.batch([
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

  return {
    status: 200,
    body: {
      sessionToken,
      browserToken: btCheck.browserToken,
      tier,
      user: { id: verified.telegramId, name: verified.telegramName },
      expiresAt: exp * 1000,
    },
  };
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
): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowMs = options.nowMs ?? Date.now();
  const visitorIp = (request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "")
    .split(",")[0]!.trim();
  const ipAddress = normalizeIpAddress(visitorIp);
  const fingerprint =
    typeof body.fingerprint === "string" ? body.fingerprint.trim().slice(0, 128) : "";

  const storageToken = body.browserToken ?? request.headers.get("X-Browser-Token");
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    storageToken,
  );

  // Turnstile verification is always required to issue a fresh 30-min allowanceToken (and to mint a new browserToken)
  const verifier =
    options.turnstileVerifier ??
    ((tok: string, ip: string) => verifyTurnstileToken(env, tok, ip));

  const tsResult = await verifier(body.turnstileToken ?? "", visitorIp);
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

  const { browserId, browserToken } = btCheck.status === "missing"
    ? await mintBrowserToken(env.BROWSER_TOKEN_SECRET)
    : btCheck;

  // Resolve optional authenticated session
  const session = await verifyActiveSession(env, body.sessionToken, browserId, nowMs);
  const tier: Tier = session ? await loadAccountTier(db, session.telegramId) : "guest";

  const policy = await loadPolicy(db);
  const allowanceExpMs = Math.min(nowMs + policy.allowanceTtlMs, session?.expiresAt ?? Infinity);

  const allowanceToken = await signHs256Jwt<AllowanceJwtPayload>(env.ALLOWANCE_JWT_SECRET, {
    typ: session ? "account_allowance_v2" : "allowance",
    browserId,
    ...(session ? { tgId: session.telegramId, tgName: session.telegramName } : {}),
    tier,
    ip: ipAddress,
    fp: fingerprint,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(allowanceExpMs / 1000),
  });

  // Informational quota/budget check (does not check 1-minute burst or reserve budget)
  const axes = { tier, telegramId: session?.telegramId ?? null, browserId, ipAddress, fingerprint };
  const checks = { checkConcurrency: false, checkRateLimit: false };
  let evalRes = await evaluateQuotasAndBudgets(db, policy, axes, nowMs, checks);
  // A continued thread may qualify for the low route. Admission selects its final route.
  if (evalRes.bucket === "high" && evalRes.block?.code === "global_budget_exceeded") {
    const low = await evaluateQuotasAndBudgets(db, policy, axes, nowMs, { ...checks, forceLow: true });
    if (low.allowed) evalRes = { ...evalRes, allowed: true, block: null };
  }

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
  };
}
