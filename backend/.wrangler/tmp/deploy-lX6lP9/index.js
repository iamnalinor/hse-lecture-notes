var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/crypto.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function base64UrlToBytes(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - input.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
__name(base64UrlToBytes, "base64UrlToBytes");
function randomToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
__name(randomToken, "randomToken");
async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
__name(sha256Hex, "sha256Hex");
async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}
__name(importHmacKey, "importHmacKey");
async function hmacSignBase64Url(secret, data) {
  const key = await importHmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}
__name(hmacSignBase64Url, "hmacSignBase64Url");
async function hmacVerifyBase64Url(secret, data, signatureBase64Url) {
  try {
    const key = await importHmacKey(secret, ["verify"]);
    const sigBytes = base64UrlToBytes(signatureBase64Url);
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
  } catch {
    return false;
  }
}
__name(hmacVerifyBase64Url, "hmacVerifyBase64Url");
async function mintBrowserToken(secret, browserId = randomToken(18)) {
  const sig = await hmacSignBase64Url(secret, browserId);
  return {
    browserId,
    browserToken: `${browserId}.${sig}`
  };
}
__name(mintBrowserToken, "mintBrowserToken");
async function verifyBrowserToken(secret, token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const browserId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (browserId.length < 8 || browserId.length > 128 || sig.length < 16) return null;
  const ok = await hmacVerifyBase64Url(secret, browserId, sig);
  if (!ok) return null;
  return { browserId, browserToken: token };
}
__name(verifyBrowserToken, "verifyBrowserToken");
async function signHs256Jwt(secret, payload) {
  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigB64 = await hmacSignBase64Url(secret, signingInput);
  return `${signingInput}.${sigB64}`;
}
__name(signHs256Jwt, "signHs256Jwt");
async function verifyHs256Jwt(secret, token, nowMs = Date.now()) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const header = JSON.parse(decoder.decode(base64UrlToBytes(headerB64)));
    if (header.alg !== "HS256") return null;
    const ok = await hmacVerifyBase64Url(secret, `${headerB64}.${payloadB64}`, sigB64);
    if (!ok) return null;
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadB64)));
    if (typeof payload.exp === "number" && payload.exp * 1e3 <= nowMs) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
__name(verifyHs256Jwt, "verifyHs256Jwt");
async function deriveAesKey(rawSecret) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(rawSecret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
__name(deriveAesKey, "deriveAesKey");
async function encryptJsonAesGcm(secret, data) {
  const key = await deriveAesKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = encoder.encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}
__name(encryptJsonAesGcm, "encryptJsonAesGcm");
async function decryptJsonAesGcm(secret, encoded) {
  const parts = encoded.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload format");
  }
  const key = await deriveAesKey(secret);
  const iv = base64UrlToBytes(parts[1]);
  const ciphertext = base64UrlToBytes(parts[2]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}
__name(decryptJsonAesGcm, "decryptJsonAesGcm");
function decodeJwtUnverified(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[1])));
    const signature = base64UrlToBytes(parts[2]);
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature
    };
  } catch {
    return null;
  }
}
__name(decodeJwtUnverified, "decodeJwtUnverified");
async function verifyRs256JwtWithJwks(token, jwks) {
  const parsed = decodeJwtUnverified(token);
  if (!parsed || parsed.header.alg !== "RS256") return null;
  const candidates = parsed.header.kid ? jwks.keys.filter((k) => k.kid === parsed.header.kid) : jwks.keys;
  for (const jwk of candidates) {
    if (jwk.kty !== "RSA") continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        parsed.signature,
        encoder.encode(parsed.signingInput)
      );
      if (valid) return parsed.payload;
    } catch {
    }
  }
  return null;
}
__name(verifyRs256JwtWithJwks, "verifyRs256JwtWithJwks");
function normalizeIpAddress(rawIp) {
  if (!rawIp) return "0.0.0.0";
  const ip = rawIp.trim().split(",")[0].trim();
  if (!ip) return "0.0.0.0";
  if (!ip.includes(":")) return ip;
  const parts = ip.toLowerCase().split("::");
  let hextets;
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = Math.max(0, 8 - (left.length + right.length));
    hextets = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    hextets = ip.toLowerCase().split(":");
  }
  const prefix = hextets.slice(0, 4).map((h) => h.padStart(4, "0"));
  return `${prefix.join(":")}::/64`;
}
__name(normalizeIpAddress, "normalizeIpAddress");

// src/pricing.ts
var PRICING_VERSION = 1;
var MODEL_PRICING = {
  "gpt-6.1-terra": {
    model: "gpt-6.1-terra",
    bucket: "high",
    inputMicrosPer1M: 1e6,
    // $1.00 / 1M
    cachedInputMicrosPer1M: 5e4,
    // $0.05 / 1M
    cacheWriteMicrosPer1M: 125e4,
    // $1.25 / 1M
    outputMicrosPer1M: 5e6,
    // $5.00 / 1M
    minUncertainRoundMicros: 5e3
    // $0.005 conservative floor on mid-stream abort
  },
  "gpt-6-luna": {
    model: "gpt-6-luna",
    bucket: "low",
    inputMicrosPer1M: 1e5,
    // $0.10 / 1M
    cachedInputMicrosPer1M: 1e4,
    // $0.01 / 1M
    cacheWriteMicrosPer1M: 125e3,
    // $0.125 / 1M (Standard processing, 1.25x input)
    outputMicrosPer1M: 5e5,
    // $0.50 / 1M
    minUncertainRoundMicros: 1e3
    // $0.001 conservative floor on mid-stream abort
  }
};
function computeRoundCostMicros(model, usage) {
  const rates = MODEL_PRICING[model];
  const inputTokens = Math.max(0, Math.floor(usage.inputTokens));
  const cachedTokens = Math.max(0, Math.floor(usage.cachedTokens));
  const cacheWriteTokens = Math.max(0, Math.floor(usage.cacheWriteTokens));
  const outputTokens = Math.max(0, Math.floor(usage.outputTokens));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  const exactMicros = (uncachedInputTokens * rates.inputMicrosPer1M + cachedTokens * rates.cachedInputMicrosPer1M + cacheWriteTokens * rates.cacheWriteMicrosPer1M + outputTokens * rates.outputMicrosPer1M) / 1e6;
  return Math.ceil(exactMicros);
}
__name(computeRoundCostMicros, "computeRoundCostMicros");
function estimateUncertainRoundCostMicros(model, estimatedPromptChars, streamedOutputChars) {
  const rates = MODEL_PRICING[model];
  const estInputTokens = Math.ceil(Math.max(0, estimatedPromptChars) / 3);
  const estOutputTokens = Math.ceil(Math.max(0, streamedOutputChars) / 3) + 200;
  const estimated = computeRoundCostMicros(model, {
    inputTokens: estInputTokens,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: estOutputTokens
  });
  return Math.max(rates.minUncertainRoundMicros, estimated);
}
__name(estimateUncertainRoundCostMicros, "estimateUncertainRoundCostMicros");

// src/telegram-alerts.ts
var ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1e3;
async function sendOwnerAlert(env, db, key, message, nowMs = Date.now(), fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.OWNER_TELEGRAM_ID) return false;
  const row = await db.first(
    db.prepare("SELECT value_json FROM service_config WHERE key = 'alerts_state'")
  );
  const state = {
    lastWeeklyWarnAt: 0,
    lastWeeklyExceededAt: 0,
    lastGuestExceededAt: 0,
    lastOauthErrorAt: 0,
    ...row ? JSON.parse(row.value_json) : {}
  };
  if (state[key] > 0 && nowMs - state[key] < ALERT_COOLDOWN_MS) {
    return false;
  }
  state[key] = nowMs;
  await db.run(
    db.prepare(
      "INSERT INTO service_config (key, value_json, updated_at) VALUES ('alerts_state', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at"
    ).bind(JSON.stringify(state), nowMs)
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
          disable_web_page_preview: true
        })
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}
__name(sendOwnerAlert, "sendOwnerAlert");

// src/types.ts
var DEFAULT_POLICY = {
  rateLimitPerMinute: 4,
  maxQuestionChars: 2e3,
  maxQuoteChars: 4e3,
  maxBodyBytes: 32768,
  maxHistoryMessages: 16,
  maxHistoryChars: 24e3,
  maxToolRounds: 5,
  maxToolCalls: 10,
  maxToolOutputChars: 12e3,
  maxTotalToolOutputChars: 36e3,
  maxResponseChars: 24e3,
  maxRunDurationMs: 6e4,
  staleRunTimeoutMs: 75e3,
  allowanceTtlMs: 18e5,
  sessionTtlMs: 2592e6,
  archiveAfterDays: 30,
  threadsPageSize: 20,
  requireLoginWithoutFingerprint: false,
  budgets: {
    weeklyGlobalUsdMicros: 3e7,
    weeklyWarnRatio: 0.8,
    dailyGuestUsdMicros: 5e5,
    reserveHighMicros: 4e4,
    reserveLowMicros: 5e3
  },
  tiers: {
    guest: { lowLimit: 3 },
    external: { lowLimit: 20 },
    internal: { highLimit: 20, lowLimit: 80 }
  }
};

// src/quotas.ts
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function hourBucketTs(nowMs) {
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS;
}
__name(hourBucketTs, "hourBucketTs");
async function loadPolicy(db) {
  const row = await db.first(
    db.prepare("SELECT value_json FROM service_config WHERE key = 'policy'")
  );
  if (!row) return DEFAULT_POLICY;
  try {
    const parsed = JSON.parse(row.value_json);
    return {
      ...DEFAULT_POLICY,
      ...parsed,
      budgets: { ...DEFAULT_POLICY.budgets, ...parsed.budgets ?? {} },
      tiers: {
        guest: { ...DEFAULT_POLICY.tiers.guest, ...parsed.tiers?.guest ?? {} },
        external: { ...DEFAULT_POLICY.tiers.external, ...parsed.tiers?.external ?? {} },
        internal: { ...DEFAULT_POLICY.tiers.internal, ...parsed.tiers?.internal ?? {} }
      }
    };
  } catch {
    return DEFAULT_POLICY;
  }
}
__name(loadPolicy, "loadPolicy");
async function readBudgetSnapshot(db, nowMs) {
  const cutoff7d = hourBucketTs(nowMs - WEEK_MS);
  const cutoff24h = hourBucketTs(nowMs - DAY_MS);
  const [globalRes, guestRes, reserveRes] = await db.batch([
    db.prepare(
      "SELECT COALESCE(SUM(global_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?"
    ).bind(cutoff7d),
    db.prepare(
      "SELECT COALESCE(SUM(guest_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?"
    ).bind(cutoff24h),
    db.prepare(
      "SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1"
    )
  ]);
  const globalActual7d = Number(globalRes?.results[0]?.total ?? 0);
  const guestActual24h = Number(guestRes?.results[0]?.total ?? 0);
  const reserveRow = reserveRes?.results[0];
  return {
    globalActual7d,
    guestActual24h,
    globalReserved: Number(reserveRow?.global_reserved_micros ?? 0),
    guestReserved: Number(reserveRow?.guest_reserved_micros ?? 0)
  };
}
__name(readBudgetSnapshot, "readBudgetSnapshot");
async function evaluateQuotasAndBudgets(db, policy, axes, nowMs, options = {}) {
  const checkConcurrency = options.checkConcurrency ?? true;
  const checkRateLimit = options.checkRateLimit ?? true;
  const minCutoff = nowMs - 6e4;
  const dayCutoff = nowMs - DAY_MS;
  const cutoff7d = hourBucketTs(nowMs - WEEK_MS);
  const cutoff24h = hourBucketTs(nowMs - DAY_MS);
  const isGuest = axes.tier === "guest" || axes.telegramId === null;
  const useFp = isGuest && axes.fingerprint.length > 0;
  if (isGuest && policy.requireLoginWithoutFingerprint && !axes.fingerprint) {
    const budget2 = await readBudgetSnapshot(db, nowMs);
    return {
      allowed: false,
      bucket: "low",
      model: "gpt-6-luna",
      reserveMicros: policy.budgets.reserveLowMicros,
      degraded: { active: false },
      block: { code: "auth_required" },
      weeklyWarnTriggered: false,
      budget: budget2
    };
  }
  const stmts = [
    // 0: global 7d actual (<= 168 rows)
    db.prepare(
      "SELECT COALESCE(SUM(global_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?"
    ).bind(cutoff7d),
    // 1: guest 24h actual (<= 24 rows)
    db.prepare(
      "SELECT COALESCE(SUM(guest_actual_micros), 0) AS total FROM budget_hourly WHERE hour_ts >= ?"
    ).bind(cutoff24h),
    // 2: reserves (1 row)
    db.prepare(
      "SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1"
    )
  ];
  const idx = {};
  const add = /* @__PURE__ */ __name((name, stmt) => {
    idx[name] = stmts.length;
    stmts.push(stmt);
  }, "add");
  if (isGuest) {
    if (checkRateLimit) {
      add(
        "rate_br",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?"
        ).bind(axes.browserId, minCutoff)
      );
      add(
        "rate_ip",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE ip_address = ? AND created_at >= ?"
        ).bind(axes.ipAddress, minCutoff)
      );
      if (useFp) {
        add(
          "rate_fp",
          db.prepare(
            "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE fingerprint = ? AND created_at >= ?"
          ).bind(axes.fingerprint, minCutoff)
        );
      }
    }
    if (checkConcurrency) {
      add(
        "run_br",
        db.prepare(
          "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND browser_id = ?"
        ).bind(nowMs, axes.browserId)
      );
      add(
        "run_ip",
        db.prepare(
          "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND ip_address = ?"
        ).bind(nowMs, axes.ipAddress)
      );
      if (useFp) {
        add(
          "run_fp",
          db.prepare(
            "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND fingerprint = ?"
          ).bind(nowMs, axes.fingerprint)
        );
      }
    }
    add(
      "low_br",
      db.prepare(
        "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'"
      ).bind(axes.browserId, dayCutoff)
    );
    add(
      "low_ip",
      db.prepare(
        "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE ip_address = ? AND created_at >= ? AND status != 'error'"
      ).bind(axes.ipAddress, dayCutoff)
    );
    if (useFp) {
      add(
        "low_fp",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE fingerprint = ? AND created_at >= ? AND status != 'error'"
        ).bind(axes.fingerprint, dayCutoff)
      );
    }
  } else {
    const tgId = axes.telegramId;
    if (checkRateLimit) {
      add(
        "rate_tg",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?"
        ).bind(tgId, minCutoff)
      );
      add(
        "rate_br",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket IN ('high', 'low') AND created_at >= ?"
        ).bind(axes.browserId, minCutoff)
      );
    }
    if (checkConcurrency) {
      add(
        "run_tg",
        db.prepare(
          "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND telegram_id = ?"
        ).bind(nowMs, tgId)
      );
      add(
        "run_br",
        db.prepare(
          "SELECT COUNT(*) AS cnt FROM usage_runs WHERE status = 'running' AND expires_at >= ? AND browser_id = ?"
        ).bind(nowMs, axes.browserId)
      );
    }
    add(
      "low_tg",
      db.prepare(
        "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'"
      ).bind(tgId, dayCutoff)
    );
    add(
      "low_br",
      db.prepare(
        "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'low' AND created_at >= ? AND status != 'error'"
      ).bind(axes.browserId, dayCutoff)
    );
    if (axes.tier === "internal") {
      add(
        "high_tg",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE telegram_id = ? AND quota_bucket = 'high' AND created_at >= ? AND status != 'error'"
        ).bind(tgId, dayCutoff)
      );
      add(
        "high_br",
        db.prepare(
          "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM usage_runs WHERE browser_id = ? AND quota_bucket = 'high' AND created_at >= ? AND status != 'error'"
        ).bind(axes.browserId, dayCutoff)
      );
    }
  }
  const results = await db.batch(stmts);
  const budget = {
    globalActual7d: Number(results[0]?.results[0]?.total ?? 0),
    guestActual24h: Number(results[1]?.results[0]?.total ?? 0),
    globalReserved: Number(results[2]?.results[0]?.global_reserved_micros ?? 0),
    guestReserved: Number(results[2]?.results[0]?.guest_reserved_micros ?? 0)
  };
  const getCount = /* @__PURE__ */ __name((key) => {
    const i = idx[key];
    if (i === void 0) return { cnt: 0, oldest: null };
    const row = results[i]?.results[0];
    return {
      cnt: Number(row?.cnt ?? 0),
      oldest: typeof row?.oldest === "number" ? row.oldest : null
    };
  }, "getCount");
  const maxAxis = /* @__PURE__ */ __name((keys) => {
    let count = 0;
    let oldest = null;
    for (const k of keys) {
      const r = getCount(k);
      if (r.cnt > count) {
        count = r.cnt;
        oldest = r.oldest;
      } else if (r.cnt === count && r.cnt > 0 && r.oldest !== null) {
        oldest = oldest === null ? r.oldest : Math.min(oldest, r.oldest);
      }
    }
    return { count, oldest };
  }, "maxAxis");
  let bucket = "low";
  let model = "gpt-6-luna";
  let degraded = { active: false };
  let quotaBlock = null;
  if (isGuest) {
    const lowKeys = useFp ? ["low_br", "low_ip", "low_fp"] : ["low_br", "low_ip"];
    const low = maxAxis(lowKeys);
    if (low.count >= policy.tiers.guest.lowLimit) {
      quotaBlock = {
        code: "auth_required",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS
      };
    }
  } else if (axes.tier === "external") {
    const low = maxAxis(["low_tg", "low_br"]);
    if (low.count >= policy.tiers.external.lowLimit) {
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: low.oldest ? low.oldest + DAY_MS : nowMs + DAY_MS
      };
    }
  } else {
    const high = maxAxis(["high_tg", "high_br"]);
    const low = maxAxis(["low_tg", "low_br"]);
    if (high.count < policy.tiers.internal.highLimit) {
      bucket = "high";
      model = "gpt-6.1-terra";
      degraded = { active: false };
    } else if (low.count < policy.tiers.internal.lowLimit) {
      bucket = "low";
      model = "gpt-6-luna";
      degraded = {
        active: true,
        restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS
      };
    } else {
      bucket = "low";
      model = "gpt-6-luna";
      degraded = {
        active: true,
        restoresAt: high.oldest ? high.oldest + DAY_MS : nowMs + DAY_MS
      };
      const candidates = [high.oldest, low.oldest].filter((v) => v !== null);
      const earliest = candidates.length > 0 ? Math.min(...candidates) : nowMs;
      quotaBlock = {
        code: "tier_quota_exceeded",
        nextAvailableAt: earliest + DAY_MS
      };
    }
  }
  const reserveMicros = bucket === "high" ? policy.budgets.reserveHighMicros : policy.budgets.reserveLowMicros;
  const globalProjected = budget.globalActual7d + budget.globalReserved + reserveMicros;
  const weeklyWarnTriggered = globalProjected >= Math.floor(policy.budgets.weeklyGlobalUsdMicros * policy.budgets.weeklyWarnRatio);
  if (globalProjected > policy.budgets.weeklyGlobalUsdMicros) {
    return {
      allowed: false,
      bucket,
      model,
      reserveMicros,
      degraded,
      block: { code: "global_budget_exceeded" },
      weeklyWarnTriggered: true,
      budget
    };
  }
  if (isGuest) {
    const guestProjected = budget.guestActual24h + budget.guestReserved + reserveMicros;
    if (guestProjected > policy.budgets.dailyGuestUsdMicros) {
      return {
        allowed: false,
        bucket,
        model,
        reserveMicros,
        degraded,
        block: { code: "guest_budget_exceeded" },
        weeklyWarnTriggered,
        budget
      };
    }
  }
  if (quotaBlock) {
    return {
      allowed: false,
      bucket,
      model,
      reserveMicros,
      degraded,
      block: quotaBlock,
      weeklyWarnTriggered,
      budget
    };
  }
  if (checkConcurrency) {
    const runKeys = isGuest ? useFp ? ["run_br", "run_ip", "run_fp"] : ["run_br", "run_ip"] : ["run_tg", "run_br"];
    const active = maxAxis(runKeys);
    if (active.count >= 1) {
      return {
        allowed: false,
        bucket,
        model,
        reserveMicros,
        degraded,
        block: { code: "concurrent_run" },
        weeklyWarnTriggered,
        budget
      };
    }
  }
  if (checkRateLimit) {
    const rateKeys = isGuest ? useFp ? ["rate_br", "rate_ip", "rate_fp"] : ["rate_br", "rate_ip"] : ["rate_tg", "rate_br"];
    const rate = maxAxis(rateKeys);
    if (rate.count >= policy.rateLimitPerMinute) {
      const retryAfterSec = rate.oldest ? Math.max(1, Math.ceil((rate.oldest + 6e4 - nowMs) / 1e3)) : 15;
      return {
        allowed: false,
        bucket,
        model,
        reserveMicros,
        degraded,
        block: { code: "rate_limited", retryAfterSec },
        weeklyWarnTriggered,
        budget
      };
    }
  }
  return {
    allowed: true,
    bucket,
    model,
    reserveMicros,
    degraded,
    block: null,
    weeklyWarnTriggered,
    budget
  };
}
__name(evaluateQuotasAndBudgets, "evaluateQuotasAndBudgets");
async function finalizeRunAtomic(db, input) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = await db.first(
    db.prepare(
      "SELECT id, status, tier, model, thread_id, assistant_message_id, reserved_cost_micros, actual_cost_micros, created_at FROM usage_runs WHERE id = ?"
    ).bind(input.runId)
  );
  if (!existing || existing.status !== "running") {
    return false;
  }
  let finalCostMicros = Math.max(existing.actual_cost_micros, Math.ceil(input.actualCostMicros));
  const zeroOutputError = input.finalStatus === "error" && input.errorCode !== "run_expired" && finalCostMicros === 0 && (input.toolRounds ?? 0) === 0 && (input.streamedOutputChars ?? (input.contentTex?.length ?? 0)) === 0;
  if (input.isCostUncertain && !zeroOutputError) {
    const uncertainFloor = estimateUncertainRoundCostMicros(
      existing.model,
      input.estimatedPromptChars ?? 6e3,
      input.streamedOutputChars ?? (input.contentTex?.length ?? 0)
    );
    finalCostMicros = Math.max(finalCostMicros, existing.actual_cost_micros + uncertainFloor);
  }
  const casRes = await db.run(
    db.prepare(
      `UPDATE usage_runs
         SET status = ?,
             finished_at = ?,
             updated_at = ?,
             reserved_cost_micros = 0,
             actual_cost_micros = ?,
             is_cost_uncertain = CASE WHEN ? = 1 THEN 1 ELSE is_cost_uncertain END,
             input_tokens = COALESCE(?, input_tokens),
             cached_tokens = COALESCE(?, cached_tokens),
             cache_write_tokens = COALESCE(?, cache_write_tokens),
             output_tokens = COALESCE(?, output_tokens),
             tool_rounds = COALESCE(?, tool_rounds),
             tool_calls = COALESCE(?, tool_calls),
             error_code = ?
         WHERE id = ? AND status = 'running'`
    ).bind(
      input.finalStatus,
      nowMs,
      nowMs,
      finalCostMicros,
      input.isCostUncertain ? 1 : 0,
      input.inputTokens ?? null,
      input.cachedTokens ?? null,
      input.cacheWriteTokens ?? null,
      input.outputTokens ?? null,
      input.toolRounds ?? null,
      input.toolCalls ?? null,
      input.errorCode ?? null,
      input.runId
    )
  );
  if ((casRes.meta?.changes ?? 0) !== 1) {
    return false;
  }
  const hourTs = hourBucketTs(existing.created_at);
  const isGuest = existing.tier === "guest";
  const guestDelta = isGuest ? finalCostMicros : 0;
  const guestReserveRelease = isGuest ? existing.reserved_cost_micros : 0;
  const postStmts = [
    db.prepare(
      `UPDATE chat_messages
         SET status = ?,
             content_tex = COALESCE(?, content_tex),
             steps_json = COALESCE(?, steps_json),
             agent_items_json = COALESCE(?, agent_items_json),
             error_message = ?,
             updated_at = ?
         WHERE id = ?`
    ).bind(
      input.messageStatus,
      input.contentTex ?? null,
      input.stepsJson ?? null,
      input.agentItemsJson ?? null,
      input.errorMessage ?? null,
      nowMs,
      existing.assistant_message_id
    ),
    db.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?").bind(nowMs, existing.thread_id),
    db.prepare(
      `INSERT INTO budget_hourly (hour_ts, global_actual_micros, guest_actual_micros, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(hour_ts) DO UPDATE SET
           global_actual_micros = budget_hourly.global_actual_micros + excluded.global_actual_micros,
           guest_actual_micros = budget_hourly.guest_actual_micros + excluded.guest_actual_micros,
           updated_at = excluded.updated_at`
    ).bind(hourTs, finalCostMicros, guestDelta, nowMs),
    db.prepare(
      `UPDATE budget_reserves
         SET global_reserved_micros = MAX(0, global_reserved_micros - ?),
             guest_reserved_micros = MAX(0, guest_reserved_micros - ?),
             updated_at = ?
         WHERE id = 1`
    ).bind(existing.reserved_cost_micros, guestReserveRelease, nowMs)
  ];
  await db.batch(postStmts);
  return true;
}
__name(finalizeRunAtomic, "finalizeRunAtomic");
async function sweepExpiredRuns(db, nowMs) {
  const expired = await db.all(
    db.prepare(
      "SELECT id, actual_cost_micros FROM usage_runs WHERE status = 'running' AND expires_at < ? LIMIT 10"
    ).bind(nowMs)
  );
  let swept = 0;
  for (const row of expired.results) {
    const ok = await finalizeRunAtomic(db, {
      runId: row.id,
      finalStatus: "error",
      messageStatus: "incomplete",
      errorCode: "run_expired",
      errorMessage: "\u041E\u0442\u0432\u0435\u0442 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u0432\u043E\u0432\u0440\u0435\u043C\u044F. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0437\u0430\u0434\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441 \u0435\u0449\u0451 \u0440\u0430\u0437.",
      actualCostMicros: row.actual_cost_micros,
      isCostUncertain: true,
      nowMs
    });
    if (ok) swept += 1;
  }
  return swept;
}
__name(sweepExpiredRuns, "sweepExpiredRuns");
async function checkpointRound(db, policy, params) {
  let updatedReservedMicros = params.currentReservedMicros;
  let canContinueToolRounds = true;
  await db.run(
    db.prepare(
      `UPDATE usage_runs
         SET actual_cost_micros = ?,
             input_tokens = ?,
             cached_tokens = ?,
             cache_write_tokens = ?,
             output_tokens = ?,
             tool_rounds = ?,
             tool_calls = ?,
             updated_at = ?
         WHERE id = ? AND status = 'running'`
    ).bind(
      params.cumulativeActualMicros,
      params.inputTokens,
      params.cachedTokens,
      params.cacheWriteTokens,
      params.outputTokens,
      params.toolRounds,
      params.toolCalls,
      params.nowMs,
      params.runId
    )
  );
  const roundBuffer = params.bucket === "high" ? Math.ceil(policy.budgets.reserveHighMicros / 2) : Math.ceil(policy.budgets.reserveLowMicros / 2);
  if (params.cumulativeActualMicros + roundBuffer > params.currentReservedMicros) {
    const budget = await readBudgetSnapshot(db, params.nowMs);
    const delta = params.cumulativeActualMicros + roundBuffer - params.currentReservedMicros;
    const isGuest = params.tier === "guest";
    const globalOk = budget.globalActual7d + budget.globalReserved + delta <= policy.budgets.weeklyGlobalUsdMicros;
    const guestOk = !isGuest || budget.guestActual24h + budget.guestReserved + delta <= policy.budgets.dailyGuestUsdMicros;
    if (!globalOk || !guestOk) {
      canContinueToolRounds = false;
    } else {
      updatedReservedMicros = params.currentReservedMicros + delta;
      await db.batch([
        db.prepare(
          "UPDATE usage_runs SET reserved_cost_micros = ?, updated_at = ? WHERE id = ? AND status = 'running'"
        ).bind(updatedReservedMicros, params.nowMs, params.runId),
        db.prepare(
          `UPDATE budget_reserves
             SET global_reserved_micros = global_reserved_micros + ?,
                 guest_reserved_micros = guest_reserved_micros + ?,
                 updated_at = ?
             WHERE id = 1`
        ).bind(delta, isGuest ? delta : 0, params.nowMs)
      ]);
    }
  }
  return { updatedReservedMicros, canContinueToolRounds };
}
__name(checkpointRound, "checkpointRound");
function deriveThreadTitle(text, quote) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length > 0) {
    return cleaned.length > 72 ? `${cleaned.slice(0, 71).trimEnd()}\u2026` : cleaned;
  }
  if (quote?.label) {
    return quote.label.length > 72 ? `${quote.label.slice(0, 71).trimEnd()}\u2026` : quote.label;
  }
  return "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442";
}
__name(deriveThreadTitle, "deriveThreadTitle");
async function admitRunAtomic(db, policy, params) {
  const nowMs = params.nowMs ?? Date.now();
  const isGuest = params.axes.tier === "guest" || params.axes.telegramId === null;
  const ownerKey = isGuest ? `br:${params.axes.browserId}` : `tg:${params.axes.telegramId}`;
  const idempRow = isGuest ? await db.first(
    db.prepare(
      "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key = ? AND client_request_id = ?"
    ).bind(ownerKey, params.clientRequestId)
  ) : await db.first(
    db.prepare(
      "SELECT id, payload_hash, thread_id, user_message_id, assistant_message_id, status, model FROM usage_runs WHERE owner_key IN (?, ?) AND client_request_id = ? LIMIT 1"
    ).bind(ownerKey, `br:${params.axes.browserId}`, params.clientRequestId)
  );
  if (idempRow) {
    const thread = await db.first(
      db.prepare("SELECT id, title, browser_id, telegram_id FROM chat_threads WHERE id = ?").bind(idempRow.thread_id)
    );
    const ownsThread = thread && (isGuest ? thread.browser_id === params.axes.browserId && thread.telegram_id === null : thread.telegram_id === params.axes.telegramId);
    if (!ownsThread || idempRow.payload_hash !== params.payloadHash) {
      return { kind: "conflict", message: "clientRequestId reused with different payload or thread" };
    }
    return {
      kind: "duplicate",
      runId: idempRow.id,
      threadId: idempRow.thread_id,
      threadTitle: thread.title,
      userMessageId: idempRow.user_message_id,
      assistantMessageId: idempRow.assistant_message_id,
      status: idempRow.status,
      model: idempRow.model
    };
  }
  await sweepExpiredRuns(db, nowMs);
  const evalRes = await evaluateQuotasAndBudgets(db, policy, params.axes, nowMs, {
    checkConcurrency: true,
    checkRateLimit: true
  });
  if (evalRes.weeklyWarnTriggered) {
    const pct = Math.round(
      (evalRes.budget.globalActual7d + evalRes.budget.globalReserved) / policy.budgets.weeklyGlobalUsdMicros * 100
    );
    await sendOwnerAlert(
      params.env,
      db,
      "lastWeeklyWarnAt",
      `Weekly budget reached ~${pct}% ($${((evalRes.budget.globalActual7d + evalRes.budget.globalReserved) / 1e6).toFixed(2)} / $${(policy.budgets.weeklyGlobalUsdMicros / 1e6).toFixed(2)}).`,
      nowMs
    );
  }
  if (!evalRes.allowed && evalRes.block) {
    if (evalRes.block.code === "global_budget_exceeded") {
      await sendOwnerAlert(
        params.env,
        db,
        "lastWeeklyExceededAt",
        "Global 7-day budget limit exceeded! Chat requests are paused.",
        nowMs
      );
    } else if (evalRes.block.code === "guest_budget_exceeded") {
      await sendOwnerAlert(
        params.env,
        db,
        "lastGuestExceededAt",
        "Guest 24-hour budget limit exceeded! Guests are prompted to sign in.",
        nowMs
      );
    }
    return { kind: "blocked", block: evalRes.block, degraded: evalRes.degraded };
  }
  let threadId = params.threadId;
  let threadTitle = deriveThreadTitle(params.questionText, params.quote);
  let nextSeq = 1;
  let creatingThread = false;
  if (threadId) {
    const [threadRes, seqRes] = await db.batch([
      db.prepare("SELECT id, title, course, doc_id, browser_id, telegram_id FROM chat_threads WHERE id = ?").bind(threadId),
      db.prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_messages WHERE thread_id = ?").bind(threadId)
    ]);
    const thread = threadRes?.results[0];
    const ownsThread = thread && (isGuest ? thread.browser_id === params.axes.browserId && thread.telegram_id === null : thread.telegram_id === params.axes.telegramId);
    if (!ownsThread) {
      return { kind: "not_found", message: "Thread not found or not owned by user" };
    }
    threadTitle = thread.title;
    nextSeq = Number(seqRes?.results[0]?.max_seq ?? 0) + 1;
  } else {
    creatingThread = true;
    threadId = `thr_${randomToken(12)}`;
  }
  const runId = `run_${randomToken(12)}`;
  let userMessageId = `msg_${randomToken(12)}`;
  let assistantMessageId = `msg_${randomToken(12)}`;
  let retryAssistantSeq = null;
  const expiresAt = nowMs + policy.staleRunTimeoutMs;
  const quoteJson = params.quote ? JSON.stringify(params.quote) : null;
  if (!creatingThread && params.retryAssistantMessageId) {
    const retryTarget = await db.first(
      db.prepare("SELECT id, seq, role FROM chat_messages WHERE id = ? AND thread_id = ?").bind(params.retryAssistantMessageId, threadId)
    );
    if (retryTarget && retryTarget.role === "assistant") {
      const prevUser = await db.first(
        db.prepare(
          "SELECT id FROM chat_messages WHERE thread_id = ? AND seq < ? AND role = 'user' ORDER BY seq DESC LIMIT 1"
        ).bind(threadId, retryTarget.seq)
      );
      if (prevUser) {
        userMessageId = prevUser.id;
        assistantMessageId = retryTarget.id;
        retryAssistantSeq = retryTarget.seq;
      }
    }
  }
  const insertStmts = [];
  if (creatingThread) {
    insertStmts.push(
      db.prepare(
        `INSERT INTO chat_threads (id, course, doc_id, title, browser_id, telegram_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        threadId,
        params.course,
        params.docId,
        threadTitle,
        isGuest ? params.axes.browserId : null,
        isGuest ? null : params.axes.telegramId,
        nowMs,
        nowMs
      )
    );
  } else {
    insertStmts.push(
      db.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?").bind(nowMs, threadId)
    );
  }
  if (retryAssistantSeq !== null) {
    insertStmts.push(
      db.prepare("DELETE FROM chat_messages WHERE thread_id = ? AND seq > ?").bind(threadId, retryAssistantSeq),
      db.prepare(
        `UPDATE chat_messages
           SET status = 'running', content_tex = '', steps_json = NULL, agent_items_json = NULL, error_message = NULL, run_id = ?, updated_at = ?
           WHERE id = ?`
      ).bind(runId, nowMs, assistantMessageId)
    );
  } else {
    insertStmts.push(
      db.prepare(
        `INSERT INTO chat_messages (id, thread_id, seq, role, status, content_tex, quote_json, run_id, created_at, updated_at)
           VALUES (?, ?, ?, 'user', 'done', ?, ?, ?, ?, ?)`
      ).bind(userMessageId, threadId, nextSeq, params.questionText, quoteJson, runId, nowMs, nowMs),
      db.prepare(
        `INSERT INTO chat_messages (id, thread_id, seq, role, status, content_tex, run_id, created_at, updated_at)
           VALUES (?, ?, ?, 'assistant', 'running', '', ?, ?, ?)`
      ).bind(assistantMessageId, threadId, nextSeq + 1, runId, nowMs, nowMs)
    );
  }
  insertStmts.push(
    db.prepare(
      `INSERT INTO usage_runs (
           id, owner_key, client_request_id, payload_hash, thread_id, user_message_id, assistant_message_id,
           created_at, updated_at, expires_at, status, tier, quota_bucket, model, pricing_version,
           reserved_cost_micros, telegram_id, browser_id, ip_address, fingerprint
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      runId,
      ownerKey,
      params.clientRequestId,
      params.payloadHash,
      threadId,
      userMessageId,
      assistantMessageId,
      nowMs,
      nowMs,
      expiresAt,
      params.axes.tier,
      evalRes.bucket,
      evalRes.model,
      PRICING_VERSION,
      evalRes.reserveMicros,
      isGuest ? null : params.axes.telegramId,
      params.axes.browserId,
      params.axes.ipAddress,
      params.axes.fingerprint
    ),
    db.prepare(
      `UPDATE budget_reserves
         SET global_reserved_micros = global_reserved_micros + ?,
             guest_reserved_micros = guest_reserved_micros + ?,
             updated_at = ?
         WHERE id = 1`
    ).bind(evalRes.reserveMicros, isGuest ? evalRes.reserveMicros : 0, nowMs)
  );
  try {
    await db.batch(insertStmts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("idx_usage_runs_active_thread") || msg.includes("UNIQUE constraint failed: usage_runs.thread_id")) {
      return { kind: "blocked", block: { code: "concurrent_run" }, degraded: evalRes.degraded };
    }
    if (msg.includes("idx_usage_runs_idempotency") || msg.includes("UNIQUE constraint failed: usage_runs.owner_key")) {
      return { kind: "conflict", message: "Concurrent duplicate clientRequestId" };
    }
    throw err;
  }
  return {
    kind: "admitted",
    runId,
    threadId,
    threadTitle,
    userMessageId,
    assistantMessageId,
    bucket: evalRes.bucket,
    model: evalRes.model,
    reserveMicros: evalRes.reserveMicros,
    degraded: evalRes.degraded
  };
}
__name(admitRunAtomic, "admitRunAtomic");

// src/auth.ts
var BROWSER_COOKIE_NAME = "browser_token";
var NONCE_TTL_MS = 5 * 6e4;
var MIGRATION_IDEMPOTENCY_WINDOW_MS = 10 * 6e4;
var cachedJwks = null;
var JWKS_CACHE_TTL_MS = 10 * 6e4;
function parseCookieHeader(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
__name(parseCookieHeader, "parseCookieHeader");
function makeBrowserTokenCookie(browserToken, isSecure = true) {
  const attrs = [
    `${BROWSER_COOKIE_NAME}=${encodeURIComponent(browserToken)}`,
    "Max-Age=31536000",
    "Path=/",
    "HttpOnly"
  ];
  if (isSecure) {
    attrs.push("Secure", "SameSite=None", "Partitioned");
  } else {
    attrs.push("SameSite=Lax");
  }
  return attrs.join("; ");
}
__name(makeBrowserTokenCookie, "makeBrowserTokenCookie");
async function resolveBrowserToken(secret, cookieHeader, storageToken) {
  const cookies = parseCookieHeader(cookieHeader);
  const cookieRaw = cookies[BROWSER_COOKIE_NAME] ?? null;
  const [cookieVerified, storageVerified] = await Promise.all([
    verifyBrowserToken(secret, cookieRaw),
    verifyBrowserToken(secret, storageToken ?? null)
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
      needsStorageSync: false
    };
  }
  if (cookieVerified) {
    return {
      status: "ok",
      browserId: cookieVerified.browserId,
      browserToken: cookieVerified.browserToken,
      needsCookieSync: false,
      needsStorageSync: true
    };
  }
  if (storageVerified) {
    return {
      status: "ok",
      browserId: storageVerified.browserId,
      browserToken: storageVerified.browserToken,
      needsCookieSync: true,
      needsStorageSync: false
    };
  }
  return { status: "missing" };
}
__name(resolveBrowserToken, "resolveBrowserToken");
async function verifyActiveSession(env, db, sessionToken, nowMs = Date.now()) {
  const payload = await verifyHs256Jwt(
    env.ALLOWANCE_JWT_SECRET,
    sessionToken,
    nowMs
  );
  if (!payload || payload.typ !== "session" || !payload.sid || typeof payload.tgId !== "number") {
    return null;
  }
  const [sessRes, internalRes] = await db.batch([
    db.prepare(
      "SELECT id, telegram_id, telegram_name, expires_at, revoked_at FROM user_sessions WHERE id = ?"
    ).bind(payload.sid),
    db.prepare("SELECT telegram_id FROM internal_telegram_accounts WHERE telegram_id = ?").bind(payload.tgId)
  ]);
  const row = sessRes?.results[0];
  if (!row || row.revoked_at !== null || row.expires_at <= nowMs || row.telegram_id !== payload.tgId) {
    return null;
  }
  const isInternal = Boolean(internalRes?.results[0]);
  return {
    sessionId: row.id,
    telegramId: row.telegram_id,
    telegramName: row.telegram_name,
    tier: isInternal ? "internal" : "external"
  };
}
__name(verifyActiveSession, "verifyActiveSession");
async function verifyAllowanceToken(env, db, allowanceToken, expectedBrowserId, nowMs = Date.now()) {
  const payload = await verifyHs256Jwt(
    env.ALLOWANCE_JWT_SECRET,
    allowanceToken,
    nowMs
  );
  if (!payload || payload.typ !== "allowance" || payload.browserId !== expectedBrowserId) {
    return null;
  }
  if (payload.sid) {
    const sess = await db.first(
      db.prepare("SELECT revoked_at, expires_at FROM user_sessions WHERE id = ?").bind(payload.sid)
    );
    if (!sess || sess.revoked_at !== null || sess.expires_at <= nowMs) {
      return null;
    }
  }
  return payload;
}
__name(verifyAllowanceToken, "verifyAllowanceToken");
async function verifyTurnstileToken(env, token, remoteIp, fetchImpl = fetch) {
  if (!token || token.length > 2048) {
    return { ok: false, reason: "missing_turnstile_token" };
  }
  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: remoteIp
  });
  const resp = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!resp.ok) {
    return { ok: false, reason: `siteverify_http_${resp.status}` };
  }
  const data = await resp.json();
  if (!data.success) {
    return { ok: false, reason: (data["error-codes"] ?? ["turnstile_failed"]).join(",") };
  }
  const allowedHosts = new Set(
    env.TURNSTILE_EXPECTED_HOSTNAMES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  if (data.hostname && allowedHosts.size > 0 && !allowedHosts.has(data.hostname.toLowerCase())) {
    return { ok: false, reason: `unexpected_hostname:${data.hostname}` };
  }
  if (data.action && data.action !== "chat_allowance") {
    return { ok: false, reason: `unexpected_action:${data.action}` };
  }
  return { ok: true };
}
__name(verifyTurnstileToken, "verifyTurnstileToken");
async function loadTelegramJwks(jwksUrl, fetchImpl, nowMs, forceRefresh = false) {
  if (!forceRefresh && cachedJwks && nowMs - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.doc;
  }
  const resp = await fetchImpl(jwksUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Telegram JWKS (${resp.status})`);
  }
  const doc = await resp.json();
  cachedJwks = { doc, fetchedAt: nowMs };
  return doc;
}
__name(loadTelegramJwks, "loadTelegramJwks");
async function verifyTelegramIdToken(env, idToken, nowMs = Date.now(), fetchImpl = fetch, jwksOverride) {
  let claims = null;
  if (jwksOverride) {
    claims = await verifyRs256JwtWithJwks(idToken, jwksOverride);
  } else {
    const jwks = await loadTelegramJwks(env.TELEGRAM_JWKS_URL, fetchImpl, nowMs, false);
    claims = await verifyRs256JwtWithJwks(idToken, jwks);
    if (!claims) {
      const freshJwks = await loadTelegramJwks(env.TELEGRAM_JWKS_URL, fetchImpl, nowMs, true);
      claims = await verifyRs256JwtWithJwks(idToken, freshJwks);
    }
  }
  if (!claims) return null;
  if (claims.iss !== env.TELEGRAM_ISSUER) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1e3 <= nowMs) return null;
  if (env.TELEGRAM_CLIENT_ID) {
    const expectedAud = String(env.TELEGRAM_CLIENT_ID);
    const audList = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? "")];
    if (!audList.includes(expectedAud)) return null;
  }
  const rawId = claims.id;
  const telegramId = typeof rawId === "number" ? rawId : typeof rawId === "string" && /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
  if (typeof claims.nonce !== "string" || claims.nonce.length < 12) return null;
  const telegramName = typeof claims.name === "string" && claims.name.trim() || typeof claims.preferred_username === "string" && claims.preferred_username.trim() || `User ${telegramId}`;
  return { telegramId, telegramName, nonce: claims.nonce };
}
__name(verifyTelegramIdToken, "verifyTelegramIdToken");
async function handleCreateNonce(env, db, request, nowMs = Date.now()) {
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token")
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
    db.prepare(
      "DELETE FROM auth_nonces WHERE rowid IN (SELECT rowid FROM auth_nonces WHERE expires_at < ? LIMIT 50)"
    ).bind(nowMs),
    db.prepare("INSERT INTO auth_nonces (nonce, browser_id, expires_at) VALUES (?, ?, ?)").bind(nonce, btCheck.browserId, expiresAt)
  ]);
  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      nonce,
      expiresAt,
      ...btCheck.needsStorageSync ? { browserToken: btCheck.browserToken } : {}
    },
    ...btCheck.needsCookieSync ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) } : {}
  };
}
__name(handleCreateNonce, "handleCreateNonce");
async function handleTelegramLogin(env, db, request, body, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token")
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
    options.jwksOverride
  );
  if (!verified) {
    return { status: 401, body: { code: "invalid_telegram_token", message: "Invalid Telegram ID token" } };
  }
  const consumeRes = await db.run(
    db.prepare(
      `UPDATE auth_nonces
         SET consumed_at = ?
         WHERE nonce = ? AND browser_id = ? AND consumed_at IS NULL AND expires_at > ?`
    ).bind(nowMs, verified.nonce, btCheck.browserId, nowMs)
  );
  if ((consumeRes.meta?.changes ?? 0) !== 1) {
    return { status: 401, body: { code: "invalid_or_reused_nonce", message: "Nonce invalid, expired, or already used" } };
  }
  const policy = await loadPolicy(db);
  const internalRow = await db.first(
    db.prepare("SELECT telegram_id FROM internal_telegram_accounts WHERE telegram_id = ?").bind(verified.telegramId)
  );
  const tier = internalRow ? "internal" : "external";
  const sessionId = `sess_${randomToken(18)}`;
  const expiresAt = nowMs + policy.sessionTtlMs;
  const sessionToken = await signHs256Jwt(env.ALLOWANCE_JWT_SECRET, {
    typ: "session",
    sid: sessionId,
    tgId: verified.telegramId,
    tgName: verified.telegramName,
    browserId: btCheck.browserId,
    iat: Math.floor(nowMs / 1e3),
    exp: Math.floor(expiresAt / 1e3)
  });
  const tgOwnerKey = `tg:${verified.telegramId}`;
  const brOwnerKey = `br:${btCheck.browserId}`;
  await db.batch([
    db.prepare(
      `INSERT INTO user_sessions (id, telegram_id, telegram_name, browser_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(sessionId, verified.telegramId, verified.telegramName, btCheck.browserId, nowMs, expiresAt),
    db.prepare(
      `UPDATE chat_threads
         SET telegram_id = ?, browser_id = NULL, updated_at = ?
         WHERE browser_id = ? AND telegram_id IS NULL`
    ).bind(verified.telegramId, nowMs, btCheck.browserId),
    db.prepare(
      `UPDATE usage_runs
         SET telegram_id = ?, updated_at = ?
         WHERE browser_id = ? AND telegram_id IS NULL AND status = 'running'`
    ).bind(verified.telegramId, nowMs, btCheck.browserId),
    db.prepare(
      `UPDATE usage_runs
         SET owner_key = ?, updated_at = ?
         WHERE owner_key = ? AND created_at >= ?
           AND NOT EXISTS (
             SELECT 1 FROM usage_runs u2
             WHERE u2.owner_key = ? AND u2.client_request_id = usage_runs.client_request_id
           )`
    ).bind(tgOwnerKey, nowMs, brOwnerKey, nowMs - MIGRATION_IDEMPOTENCY_WINDOW_MS, tgOwnerKey)
  ]);
  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      sessionToken,
      browserToken: btCheck.browserToken,
      tier,
      user: { id: verified.telegramId, name: verified.telegramName },
      expiresAt
    },
    ...btCheck.needsCookieSync ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) } : {}
  };
}
__name(handleTelegramLogin, "handleTelegramLogin");
async function handleLogout(env, db, sessionToken, nowMs = Date.now()) {
  const payload = await verifyHs256Jwt(
    env.ALLOWANCE_JWT_SECRET,
    sessionToken,
    nowMs
  );
  if (payload?.sid) {
    await db.run(
      db.prepare("UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(nowMs, payload.sid)
    );
  }
  return { status: 200, body: { ok: true } };
}
__name(handleLogout, "handleLogout");
async function handleAllowance(env, db, request, body, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const ipAddress = normalizeIpAddress(
    request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")
  );
  const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.trim().slice(0, 128) : "";
  const storageToken = body.browserToken ?? request.headers.get("X-Browser-Token");
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    storageToken
  );
  if (btCheck.status === "mismatch") {
    return {
      status: 409,
      body: { code: "browser_token_mismatch", message: "Cookie and localStorage browser tokens differ" }
    };
  }
  const verifier = options.turnstileVerifier ?? ((tok, ip) => verifyTurnstileToken(env, tok, ip));
  const tsResult = await verifier(body.turnstileToken ?? "", ipAddress);
  if (!tsResult.ok) {
    return {
      status: 403,
      body: {
        code: "turnstile_failed",
        message: "Turnstile verification failed",
        reason: tsResult.reason
      }
    };
  }
  let browserId;
  let browserToken;
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
  const session = await verifyActiveSession(env, db, body.sessionToken, nowMs);
  const tier = session ? session.tier : "guest";
  const policy = await loadPolicy(db);
  const allowanceExpMs = nowMs + policy.allowanceTtlMs;
  const allowanceToken = await signHs256Jwt(env.ALLOWANCE_JWT_SECRET, {
    typ: "allowance",
    browserId,
    ...session ? { sid: session.sessionId, tgId: session.telegramId, tgName: session.telegramName } : {},
    tier,
    ip: ipAddress,
    fp: fingerprint,
    iat: Math.floor(nowMs / 1e3),
    exp: Math.floor(allowanceExpMs / 1e3)
  });
  const evalRes = await evaluateQuotasAndBudgets(
    db,
    policy,
    {
      tier,
      telegramId: session?.telegramId ?? null,
      browserId,
      ipAddress,
      fingerprint
    },
    nowMs,
    { checkConcurrency: false, checkRateLimit: false }
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
      block: evalRes.block
    },
    ...setCookieNeeded ? { setCookie: makeBrowserTokenCookie(browserToken, isSecure) } : {}
  };
}
__name(handleAllowance, "handleAllowance");

// src/chat-runner.ts
import { DurableObject } from "cloudflare:workers";

// src/codex-auth.ts
var REFRESH_SKEW_MS = 5 * 60 * 1e3;
var LEASE_TTL_MS = 2e4;
var WAIT_FOR_LEASE_MAX_MS = 6e3;
var WAIT_POLL_MS = 250;
var CodexAuthError = class extends Error {
  static {
    __name(this, "CodexAuthError");
  }
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function extractChatGptAccountId(accessToken) {
  const parsed = decodeJwtUnverified(accessToken);
  if (!parsed) return null;
  const authClaim = parsed.payload["https://api.openai.com/auth"];
  if (authClaim && typeof authClaim.chatgpt_account_id === "string" && authClaim.chatgpt_account_id) {
    return authClaim.chatgpt_account_id;
  }
  if (typeof parsed.payload.chatgpt_account_id === "string" && parsed.payload.chatgpt_account_id) {
    return parsed.payload.chatgpt_account_id;
  }
  return null;
}
__name(extractChatGptAccountId, "extractChatGptAccountId");
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
async function getValidCodexCredentials(env, db, options = {}) {
  const now = options.now ?? (() => Date.now());
  const fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const row = await db.first(
    db.prepare("SELECT * FROM codex_credentials WHERE id = 1")
  );
  if (!row) {
    throw new CodexAuthError("oauth_needs_reauth", "codex_credentials table is not seeded");
  }
  if (row.status === "needs_reauth") {
    throw new CodexAuthError("oauth_needs_reauth", "Codex OAuth credentials require re-authentication");
  }
  const creds = await decryptJsonAesGcm(
    env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
    row.encrypted_payload
  );
  const needsRefresh = options.forceRefresh || !creds.accessToken || !creds.accountId || creds.expiresAt <= now() + REFRESH_SKEW_MS;
  if (!needsRefresh) {
    return creds;
  }
  return refreshWithLease(env, db, row, creds, now, fetchImpl);
}
__name(getValidCodexCredentials, "getValidCodexCredentials");
async function refreshWithLease(env, db, initialRow, initialCreds, now, fetchImpl) {
  const leaseOwner = `lease_${randomToken(12)}`;
  const startNow = now();
  const acquireRes = await db.run(
    db.prepare(
      `UPDATE codex_credentials
         SET lease_owner = ?, lease_until = ?, updated_at = ?
         WHERE id = 1
           AND version = ?
           AND status = 'ok'
           AND (lease_until < ? OR lease_owner IS NULL)`
    ).bind(leaseOwner, startNow + LEASE_TTL_MS, startNow, initialRow.version, startNow)
  );
  const acquired = (acquireRes.meta?.changes ?? 0) === 1;
  if (!acquired) {
    const deadline = now() + WAIT_FOR_LEASE_MAX_MS;
    while (now() < deadline) {
      await sleep(WAIT_POLL_MS);
      const latest = await db.first(
        db.prepare("SELECT * FROM codex_credentials WHERE id = 1")
      );
      if (!latest) break;
      if (latest.status === "needs_reauth") {
        throw new CodexAuthError("oauth_needs_reauth", "Codex OAuth credentials require re-authentication");
      }
      if (latest.version > initialRow.version) {
        return decryptJsonAesGcm(
          env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
          latest.encrypted_payload
        );
      }
      if (latest.lease_until < now()) {
        const latestCreds = await decryptJsonAesGcm(
          env.CODEX_CREDENTIALS_ENCRYPTION_KEY,
          latest.encrypted_payload
        );
        return refreshWithLease(env, db, latest, latestCreds, now, fetchImpl);
      }
    }
    throw new CodexAuthError("oauth_unavailable", "Timed out waiting for Codex OAuth refresh lease");
  }
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: initialCreds.refreshToken,
      client_id: env.CODEX_OAUTH_CLIENT_ID
    });
    const resp = await fetchImpl(env.CODEX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const isTerminal = resp.status === 400 || resp.status === 401 || errText.includes("invalid_grant") || errText.includes("refresh_token_reused");
      if (isTerminal) {
        await db.run(
          db.prepare(
            `UPDATE codex_credentials
               SET status = 'needs_reauth', lease_owner = NULL, lease_until = 0, updated_at = ?
               WHERE id = 1 AND lease_owner = ?`
          ).bind(now(), leaseOwner)
        );
        await sendOwnerAlert(
          env,
          db,
          "lastOauthErrorAt",
          `Codex OAuth refresh failed permanently (${resp.status}). Re-seed refresh_token via scripts/admin.ts.`,
          now(),
          fetchImpl
        );
        throw new CodexAuthError(
          "oauth_needs_reauth",
          `Codex OAuth refresh failed permanently (${resp.status})`
        );
      }
      await db.run(
        db.prepare(
          `UPDATE codex_credentials
             SET lease_owner = NULL, lease_until = 0, updated_at = ?
             WHERE id = 1 AND lease_owner = ?`
        ).bind(now(), leaseOwner)
      );
      throw new CodexAuthError("oauth_unavailable", `Codex OAuth transient failure (${resp.status})`);
    }
    const tokenJson = await resp.json();
    if (!tokenJson.access_token) {
      throw new CodexAuthError("oauth_unavailable", "Codex OAuth response missing access_token");
    }
    const accountId = extractChatGptAccountId(tokenJson.access_token) || initialCreds.accountId || "";
    const updatedCreds = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token || initialCreds.refreshToken,
      accountId,
      expiresAt: now() + Math.max(60, tokenJson.expires_in ?? 3600) * 1e3
    };
    const encrypted = await encryptJsonAesGcm(env.CODEX_CREDENTIALS_ENCRYPTION_KEY, updatedCreds);
    await db.run(
      db.prepare(
        `UPDATE codex_credentials
           SET version = version + 1,
               encrypted_payload = ?,
               status = 'ok',
               lease_owner = NULL,
               lease_until = 0,
               updated_at = ?
           WHERE id = 1 AND version = ? AND lease_owner = ?`
      ).bind(encrypted, now(), initialRow.version, leaseOwner)
    );
    return updatedCreds;
  } catch (err) {
    if (err instanceof CodexAuthError) throw err;
    await db.run(
      db.prepare(
        `UPDATE codex_credentials
           SET lease_owner = NULL, lease_until = 0, updated_at = ?
           WHERE id = 1 AND lease_owner = ?`
      ).bind(now(), leaseOwner)
    );
    throw new CodexAuthError(
      "oauth_unavailable",
      `Codex OAuth refresh network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
__name(refreshWithLease, "refreshWithLease");

// node_modules/subtls/index.js
var __defProp2 = Object.defineProperty;
var __defNormalProp = /* @__PURE__ */ __name((obj, key, value) => key in obj ? __defProp2(obj, key, {
  enumerable: true,
  configurable: true,
  writable: true,
  value
}) : obj[key] = value, "__defNormalProp");
var __publicField = /* @__PURE__ */ __name((obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value), "__publicField");
var __defProp22 = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp2 = /* @__PURE__ */ __name((obj, key, value) => key in obj ? __defProp22(obj, key, {
  enumerable: true,
  configurable: true,
  writable: true,
  value
}) : obj[key] = value, "__defNormalProp2");
var __spreadValues = /* @__PURE__ */ __name((a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp2(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp2(a, prop, b[prop]);
    }
  return a;
}, "__spreadValues");
var __spreadProps = /* @__PURE__ */ __name((a, b) => __defProps(a, __getOwnPropDescs(b)), "__spreadProps");
var chunkBytes = 1008e3;
var littleEndian = new Uint8Array(new Uint16Array([258]).buffer)[0] === 2;
var td = new TextDecoder();
var te = new TextEncoder();
var hexCharsLower = te.encode("0123456789abcdef");
var hexCharsUpper = te.encode("0123456789ABCDEF");
var b64ChStd = te.encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
var b64ChPad = 61;
var b64ChUrl = b64ChStd.slice();
b64ChUrl[62] = 45;
b64ChUrl[63] = 95;
var ccl;
var ccu;
function _toHex(in8, { alphabet, scratchArr } = {}) {
  if (!ccl) {
    ccl = new Uint16Array(256);
    ccu = new Uint16Array(256);
    if (littleEndian) for (let i2 = 0; i2 < 256; i2++) {
      ccl[i2] = hexCharsLower[i2 & 15] << 8 | hexCharsLower[i2 >>> 4];
      ccu[i2] = hexCharsUpper[i2 & 15] << 8 | hexCharsUpper[i2 >>> 4];
    }
    else for (let i2 = 0; i2 < 256; i2++) {
      ccl[i2] = hexCharsLower[i2 & 15] | hexCharsLower[i2 >>> 4] << 8;
      ccu[i2] = hexCharsUpper[i2 & 15] | hexCharsUpper[i2 >>> 4] << 8;
    }
  }
  if (in8.byteOffset % 4 !== 0) in8 = new Uint8Array(in8);
  const len = in8.length, halfLen = len >>> 1, quarterLen = len >>> 2, out16 = scratchArr || new Uint16Array(len), in32 = new Uint32Array(
    in8.buffer,
    in8.byteOffset,
    quarterLen
  ), out32 = new Uint32Array(out16.buffer, out16.byteOffset, halfLen), cc = alphabet === "upper" ? ccu : ccl;
  let i = 0, j = 0, v;
  if (littleEndian) while (i < quarterLen) {
    v = in32[i++];
    out32[j++] = cc[v >>> 8 & 255] << 16 | cc[v & 255];
    out32[j++] = cc[v >>> 24] << 16 | cc[v >>> 16 & 255];
  }
  else while (i < quarterLen) {
    v = in32[i++];
    out32[j++] = cc[v >>> 24] << 16 | cc[v >>> 16 & 255];
    out32[j++] = cc[v >>> 8 & 255] << 16 | cc[v & 255];
  }
  i <<= 2;
  while (i < len) out16[i] = cc[in8[i++]];
  const hex = td.decode(out16.subarray(0, len));
  return hex;
}
__name(_toHex, "_toHex");
function _toHexChunked(d, options = {}) {
  let hex = "", len = d.length, chunkWords = chunkBytes >>> 1, chunks = Math.ceil(len / chunkWords), scratchArr = new Uint16Array(
    chunks > 1 ? chunkWords : len
  );
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkWords, end = start + chunkWords;
    hex += _toHex(d.subarray(start, end), __spreadProps(__spreadValues({}, options), { scratchArr }));
  }
  return hex;
}
__name(_toHexChunked, "_toHexChunked");
function toHex(d, options = {}) {
  return options.alphabet !== "upper" && typeof d.toHex === "function" ? d.toHex() : _toHexChunked(d, options);
}
__name(toHex, "toHex");
var vzz = 31354;
var stdWordLookup;
var urlWordLookup;
var anyWordLookup;
var stdByteLookup;
var urlByteLookup;
var anyByteLookup;
function _fromBase64(s, { alphabet, onInvalidInput } = {}) {
  const lax = onInvalidInput === "skip";
  if (!stdWordLookup && alphabet !== "base64url" && alphabet !== "base64any") {
    stdWordLookup = new Uint16Array(vzz + 1);
    for (let l = 0; l < 64; l++) for (let r = 0; r < 64; r++) {
      const cl = b64ChStd[l], cr = b64ChStd[r], vin = littleEndian ? cr << 8 | cl : cr | cl << 8, vout = l << 6 | r;
      stdWordLookup[vin] = vout;
    }
  }
  if (!urlWordLookup && alphabet === "base64url") {
    urlWordLookup = new Uint16Array(vzz + 1);
    for (let l = 0; l < 64; l++) for (let r = 0; r < 64; r++) {
      const cl = b64ChUrl[l], cr = b64ChUrl[r], vin = littleEndian ? cr << 8 | cl : cr | cl << 8, vout = l << 6 | r;
      urlWordLookup[vin] = vout;
    }
  }
  if (!anyWordLookup && alphabet === "base64any") {
    anyWordLookup = new Uint16Array(vzz + 1);
    for (let l = 0; l < 64; l++) for (let r = 0; r < 64; r++) {
      const cl = b64ChStd[l], cr = b64ChStd[r], vin = littleEndian ? cr << 8 | cl : cr | cl << 8, vout = l << 6 | r;
      anyWordLookup[vin] = vout;
      if (l > 61 || r > 61) {
        const cl2 = b64ChUrl[l], cr2 = b64ChUrl[r], vin2 = littleEndian ? cr2 << 8 | cl2 : cr2 | cl2 << 8;
        anyWordLookup[vin2] = vout;
      }
    }
  }
  if (!stdByteLookup) {
    stdByteLookup = new Uint8Array(256).fill(66);
    urlByteLookup = new Uint8Array(256).fill(66);
    anyByteLookup = new Uint8Array(256).fill(66);
    stdByteLookup[b64ChPad] = urlByteLookup[b64ChPad] = anyByteLookup[b64ChPad] = 65;
    stdByteLookup[9] = stdByteLookup[10] = stdByteLookup[13] = stdByteLookup[32] = // tab, \r, \n, space
    urlByteLookup[9] = urlByteLookup[10] = urlByteLookup[13] = urlByteLookup[32] = anyByteLookup[9] = anyByteLookup[10] = anyByteLookup[13] = anyByteLookup[32] = 64;
    for (let i2 = 0; i2 < 64; i2++) {
      const chStdI = b64ChStd[i2], chUrlI = b64ChUrl[i2];
      stdByteLookup[chStdI] = urlByteLookup[chUrlI] = anyByteLookup[chStdI] = anyByteLookup[chUrlI] = i2;
    }
  }
  const inBytes = te.encode(s), inBytesLen = inBytes.length, inIntsLen = inBytesLen >>> 2, inInts = new Uint32Array(
    inBytes.buffer,
    inBytes.byteOffset,
    inIntsLen
  ), last3 = inIntsLen - 3, maxOutBytesLen = inIntsLen * 3 + inBytesLen % 4, outBytes = new Uint8Array(
    maxOutBytesLen
  ), outInts = new Uint32Array(outBytes.buffer, 0, maxOutBytesLen >>> 2), wl = alphabet === "base64url" ? urlWordLookup : alphabet === "base64any" ? anyWordLookup : stdWordLookup, bl = alphabet === "base64url" ? urlByteLookup : alphabet === "base64any" ? anyByteLookup : stdByteLookup;
  let i = 0, j = 0, inInt, inL, inR, vL1, vR1, vL2, vR2, vL3, vR3, vL4, vR4;
  if (littleEndian) while (i < last3) {
    inInt = inInts[i++];
    inL = inInt & 65535;
    inR = inInt >>> 16;
    vL1 = wl[inL];
    vR1 = wl[inR];
    if (!((vL1 || inL === 16705) && (vR1 || inR === 16705))) {
      i -= 1;
      break;
    }
    inInt = inInts[i++];
    inL = inInt & 65535;
    inR = inInt >>> 16;
    vL2 = wl[inL];
    vR2 = wl[inR];
    if (!((vL2 || inL === 16705) && (vR2 || inR === 16705))) {
      i -= 2;
      break;
    }
    inInt = inInts[i++];
    inL = inInt & 65535;
    inR = inInt >>> 16;
    vL3 = wl[inL];
    vR3 = wl[inR];
    if (!((vL3 || inL === 16705) && (vR3 || inR === 16705))) {
      i -= 3;
      break;
    }
    inInt = inInts[i++];
    inL = inInt & 65535;
    inR = inInt >>> 16;
    vL4 = wl[inL];
    vR4 = wl[inR];
    if (!((vL4 || inL === 16705) && (vR4 || inR === 16705))) {
      i -= 4;
      break;
    }
    outInts[j++] = vL1 >>> 4 | (vL1 & 15) << 12 | vR1 & 65280 | (vR1 & 255) << 16 | (vL2 & 4080) << 20;
    outInts[j++] = (vL2 & 15) << 4 | (vR2 & 65280) >>> 8 | (vR2 & 255) << 8 | (vL3 & 4080) << 12 | (vL3 & 15) << 28 | (vR3 & 65280) << 16;
    outInts[j++] = vR3 & 255 | (vL4 & 4080) << 4 | (vL4 & 15) << 20 | (vR4 & 3840) << 8 | vR4 << 24;
  }
  else while (i < last3) {
    inInt = inInts[i++];
    inL = inInt >>> 16;
    inR = inInt & 65535;
    vL1 = wl[inL];
    vR1 = wl[inR];
    if (!((vL1 || inL === 16705) && (vR1 || inR === 16705))) {
      i -= 1;
      break;
    }
    inInt = inInts[i++];
    inL = inInt >>> 16;
    inR = inInt & 65535;
    vL2 = wl[inL];
    vR2 = wl[inR];
    if (!((vL2 || inL === 16705) && (vR2 || inR === 16705))) {
      i -= 2;
      break;
    }
    inInt = inInts[i++];
    inL = inInt >>> 16;
    inR = inInt & 65535;
    vL3 = wl[inL];
    vR3 = wl[inR];
    if (!((vL3 || inL === 16705) && (vR3 || inR === 16705))) {
      i -= 3;
      break;
    }
    inInt = inInts[i++];
    inL = inInt >>> 16;
    inR = inInt & 65535;
    vL4 = wl[inL];
    vR4 = wl[inR];
    if (!((vL4 || inL === 16705) && (vR4 || inR === 16705))) {
      i -= 4;
      break;
    }
    outInts[j++] = vL1 << 20 | vR1 << 8 | vL2 >>> 4;
    outInts[j++] = (vL2 & 15) << 28 | vR2 << 16 | vL3 << 4 | vR3 >>> 8;
    outInts[j++] = (vR3 & 255) << 24 | vL4 << 12 | vR4;
  }
  i <<= 2;
  j <<= 2;
  if (i === inBytesLen) return outBytes;
  let i0 = i, ok = false;
  e: {
    if (lax) while (i < inBytesLen) {
      i0 = i;
      while ((vL1 = bl[inBytes[i++]]) > 63) if (vL1 === 65) ok = true;
      while ((vL2 = bl[inBytes[i++]]) > 63) if (vL2 === 65) ok = true;
      while ((vL3 = bl[inBytes[i++]]) > 63) if (vL3 === 65) ok = true;
      while ((vL4 = bl[inBytes[i++]]) > 63) if (vL4 === 65) ok = true;
      outBytes[j++] = vL1 << 2 | vL2 >>> 4;
      outBytes[j++] = (vL2 << 4 | vL3 >>> 2) & 255;
      outBytes[j++] = (vL3 << 6 | vL4) & 255;
      if (ok) break;
    }
    else while (i < inBytesLen) {
      i0 = i;
      while ((vL1 = bl[inBytes[i++]]) > 63) if (vL1 === 66) break e;
      else if (vL1 === 65) ok = true;
      while ((vL2 = bl[inBytes[i++]]) > 63) if (vL2 === 66) break e;
      else if (vL2 === 65) ok = true;
      while ((vL3 = bl[inBytes[i++]]) > 63) if (vL3 === 66) break e;
      else if (vL3 === 65) ok = true;
      while ((vL4 = bl[inBytes[i++]]) > 63) if (vL4 === 66) break e;
      else if (vL4 === 65) ok = true;
      outBytes[j++] = vL1 << 2 | vL2 >>> 4;
      outBytes[j++] = (vL2 << 4 | vL3 >>> 2) & 255;
      outBytes[j++] = (vL3 << 6 | vL4) & 255;
      if (ok) break;
    }
    ok = true;
  }
  if (!ok) throw new Error(`Invalid character in base64 at index ${i - 1}`);
  let validChars = 0;
  for (i = i0; i < inBytesLen; i++) {
    const v = bl[inBytes[i]];
    if (v < 64) validChars++;
    if (v === 65) break;
  }
  if (!lax) for (i = i0; i < inBytesLen; i++) {
    const v = bl[inBytes[i]];
    if (v > 65) throw new Error(`Invalid character in base64 after padding`);
  }
  const truncateBytes = { 4: 0, 3: 1, 2: 2, 1: 3, 0: 3 }[validChars];
  return outBytes.subarray(0, j - truncateBytes);
}
__name(_fromBase64, "_fromBase64");
function fromBase64(s, options = {}) {
  if (typeof Uint8Array.fromBase64 === "function" && options.onInvalidInput !== "skip" && options.alphabet !== "base64any") return Uint8Array.fromBase64(s, options);
  return _fromBase64(s, options);
}
__name(fromBase64, "fromBase64");
function concat(...arrs) {
  if (arrs.length === 1 && arrs[0] instanceof Uint8Array) return arrs[0];
  const length = arrs.reduce((memo, arr) => memo + arr.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const arr of arrs) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
__name(concat, "concat");
function equal(a, b) {
  const aLength = a.length;
  if (aLength !== b.length) return false;
  for (let i = 0; i < aLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
__name(equal, "equal");
var GrowableData = class {
  static {
    __name(this, "GrowableData");
  }
  constructor() {
    __publicField(this, "length");
    __publicField(this, "data");
    this.length = 0;
    this.data = new Uint8Array();
  }
  append(newData) {
    const newDataLength = newData.length;
    if (this.length + newDataLength > this.data.length) {
      const prevData = this.data;
      this.data = new Uint8Array(this.length * 2 + newDataLength);
      this.data.set(prevData);
    }
    this.data.set(newData, this.length);
    this.length += newData.length;
  }
  getData() {
    return this.data.subarray(0, this.length);
  }
};
var indentChars = "\xB7\xB7 ";
var initialSize = 1024;
var growthFactor = 2;
var txtEnc = new TextEncoder();
var txtDec = new TextDecoder();
var emptyArray = new Uint8Array(0);
var hexLookup = [];
for (let i = 0; i < 256; i++) hexLookup[i] = i.toString(16).padStart(2, "0") + " ";
var Bytes = class {
  static {
    __name(this, "Bytes");
  }
  /**
   * @param data -
   * * If data is a `Uint8Array`, this is the initial data
   * * If data is a `number`, this is the initial size in bytes (all zeroes)
   * * If data is a `function`, this function is called to retrieve data when required
   */
  constructor(data, indent = 0) {
    this.indent = indent;
    __publicField(this, "fetchFn");
    __publicField(this, "endOfReadableData");
    __publicField(this, "offset");
    __publicField(this, "dataView");
    __publicField(this, "data");
    __publicField(this, "comments");
    __publicField(this, "indents");
    this.endOfReadableData = this.offset = 0;
    this.comments = {};
    this.indents = { 0: indent };
    if (typeof data === "number") {
      this.data = new Uint8Array(data);
    } else if (data === void 0 || typeof data === "function") {
      this.data = emptyArray;
      this.fetchFn = data;
    } else {
      this.data = data;
      this.endOfReadableData = data.length;
    }
    this.dataView = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }
  readRemaining() {
    return this.endOfReadableData - this.offset;
  }
  resizeTo(newSize) {
    const newData = new Uint8Array(newSize);
    newData.set(this.data);
    this.data = newData;
    this.dataView = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }
  async ensureReadAvailable(bytes) {
    if (bytes <= this.readRemaining()) return;
    if (this.fetchFn === void 0) throw new Error("Not enough data and no read function supplied");
    const freeSpace = this.data.length - this.endOfReadableData;
    if (bytes > freeSpace) {
      const newSize = Math.max(
        initialSize,
        this.data.length * growthFactor,
        this.endOfReadableData + bytes
      );
      this.resizeTo(newSize);
    }
    const newData = await this.fetchFn(bytes);
    if (newData === void 0 || newData.length < bytes) {
      const e = new Error(`Not enough data returned by read function. 
  data.length:       ${this.data.length}
  endOfReadableData: ${this.endOfReadableData}
  offset:            ${this.offset}
  bytes requested:   ${bytes}
  bytes returned:    ${newData && newData.length}`);
      e._bytes_error_reason = "EOF";
      throw e;
    }
    this.data.set(newData, this.endOfReadableData);
    this.endOfReadableData += newData.length;
  }
  ensureWriteAvailable(bytes) {
    if (this.offset + bytes < this.data.length) return;
    const newSize = Math.max(
      initialSize,
      this.data.length * growthFactor,
      this.offset + bytes
    );
    this.resizeTo(newSize);
  }
  expectLength(length, indentDelta = 1) {
    const startOffset = this.offset;
    const endOffset = startOffset + length;
    this.indent += indentDelta;
    this.indents[startOffset] = this.indent;
    return [
      () => {
        this.indent -= indentDelta;
        this.indents[this.offset] = this.indent;
        if (this.offset !== endOffset) throw new Error(`${length} bytes expected but ${this.offset - startOffset} advanced`);
      },
      () => endOffset - this.offset
    ];
  }
  comment(s, offset = this.offset) {
    if (true) throw new Error("No comments should be emitted outside of chatty mode");
    const existing = this.comments[offset];
    const result = (existing === void 0 ? "" : existing + " ") + s;
    this.comments[offset] = result;
    return this;
  }
  lengthComment(length, comment, inclusive = false) {
    return length === 1 ? `${length} byte${comment ? ` of ${comment}` : ""} ${inclusive ? "starts here" : "follows"}` : `${length === 0 ? "no" : length} bytes${comment ? ` of ${comment}` : ""} ${inclusive ? "start here" : "follow"}`;
  }
  // reading
  async subarrayForRead(length) {
    await this.ensureReadAvailable(length);
    return this.data.subarray(this.offset, this.offset += length);
  }
  async skipRead(length, comment) {
    await this.ensureReadAvailable(length);
    this.offset += length;
    if (comment) this.comment(comment);
    return this;
  }
  async readBytes(length) {
    await this.ensureReadAvailable(length);
    return this.data.slice(this.offset, this.offset += length);
  }
  async readUTF8String(length) {
    await this.ensureReadAvailable(length);
    const bytes = await this.subarrayForRead(length);
    const s = txtDec.decode(bytes);
    return s;
  }
  async readUTF8StringNullTerminated() {
    let i = 0;
    while (true) {
      await this.ensureReadAvailable(i + 1);
      const charCode = this.data[this.offset + i];
      if (charCode === 0) break;
      i++;
    }
    ;
    const str = await this.readUTF8String(i);
    await this.expectUint8(0, "end of string");
    return str;
  }
  async readUint8(comment) {
    await this.ensureReadAvailable(1);
    const result = this.dataView.getUint8(this.offset);
    this.offset += 1;
    if (0) this.comment(comment.replace(/%/g, String(result)));
    return result;
  }
  async readUint16(comment) {
    await this.ensureReadAvailable(2);
    const result = this.dataView.getUint16(this.offset);
    this.offset += 2;
    if (0) this.comment(comment.replace(/%/g, String(result)));
    return result;
  }
  async readUint24(comment) {
    await this.ensureReadAvailable(3);
    const msb = await this.readUint8();
    const lsbs = await this.readUint16();
    const result = (msb << 16) + lsbs;
    if (0) this.comment(comment.replace(/%/g, String(result)));
    return result;
  }
  async readUint32(comment) {
    await this.ensureReadAvailable(4);
    const result = this.dataView.getUint32(this.offset);
    this.offset += 4;
    if (0) this.comment(comment.replace(/%/g, String(result)));
    return result;
  }
  async expectBytes(expected, comment) {
    await this.ensureReadAvailable(expected.length);
    const actual = await this.readBytes(expected.length);
    if (0) this.comment(comment);
    if (!equal(actual, expected)) throw new Error("Unexpected bytes");
  }
  async expectUint8(expectedValue, comment) {
    const actualValue = await this.readUint8();
    if (0) this.comment(comment);
    if (actualValue !== expectedValue) throw new Error(`Expected ${expectedValue}, got ${actualValue}`);
  }
  async expectUint16(expectedValue, comment) {
    const actualValue = await this.readUint16();
    if (0) this.comment(comment);
    if (actualValue !== expectedValue) throw new Error(`Expected ${expectedValue}, got ${actualValue}`);
  }
  async expectUint24(expectedValue, comment) {
    const actualValue = await this.readUint24();
    if (0) this.comment(comment);
    if (actualValue !== expectedValue) throw new Error(`Expected ${expectedValue}, got ${actualValue}`);
  }
  async expectUint32(expectedValue, comment) {
    const actualValue = await this.readUint32();
    if (0) this.comment(comment);
    if (actualValue !== expectedValue) throw new Error(`Expected ${expectedValue}, got ${actualValue}`);
  }
  async expectReadLength(length, indentDelta = 1) {
    await this.ensureReadAvailable(length);
    return this.expectLength(length, indentDelta);
  }
  async expectLengthUint8(comment) {
    const length = await this.readUint8();
    return this.expectReadLength(length);
  }
  async expectLengthUint16(comment) {
    const length = await this.readUint16();
    return this.expectReadLength(length);
  }
  async expectLengthUint24(comment) {
    const length = await this.readUint24();
    return this.expectReadLength(length);
  }
  async expectLengthUint32(comment) {
    const length = await this.readUint32();
    return this.expectReadLength(length);
  }
  async expectLengthUint8Incl(comment) {
    const length = await this.readUint8();
    return this.expectReadLength(length - 1);
  }
  async expectLengthUint16Incl(comment) {
    const length = await this.readUint16();
    return this.expectReadLength(length - 2);
  }
  async expectLengthUint24Incl(comment) {
    const length = await this.readUint24();
    return this.expectReadLength(length - 3);
  }
  async expectLengthUint32Incl(comment) {
    const length = await this.readUint32();
    return this.expectReadLength(length - 4);
  }
  // writing
  subarrayForWrite(length) {
    this.ensureWriteAvailable(length);
    return this.data.subarray(this.offset, this.offset += length);
  }
  skipWrite(length, comment) {
    this.ensureWriteAvailable(length);
    this.offset += length;
    if (comment) this.comment(comment);
    return this;
  }
  writeBytes(bytes) {
    this.ensureWriteAvailable(bytes.length);
    this.data.set(bytes, this.offset);
    this.offset += bytes.length;
    return this;
  }
  writeUTF8String(s) {
    const bytes = txtEnc.encode(s);
    this.writeBytes(bytes);
    return this;
  }
  writeUTF8StringNullTerminated(s) {
    const bytes = txtEnc.encode(s);
    this.writeBytes(bytes);
    this.writeUint8(0);
    return this;
  }
  writeUint8(value, comment) {
    this.ensureWriteAvailable(1);
    this.dataView.setUint8(this.offset, value);
    this.offset += 1;
    if (0) this.comment(comment);
    return this;
  }
  writeUint16(value, comment) {
    this.ensureWriteAvailable(2);
    this.dataView.setUint16(this.offset, value);
    this.offset += 2;
    if (0) this.comment(comment);
    return this;
  }
  writeUint24(value, comment) {
    this.writeUint8((value & 16711680) >> 16);
    this.writeUint16(value & 65535, comment);
    return this;
  }
  writeUint32(value, comment) {
    this.ensureWriteAvailable(4);
    this.dataView.setUint32(this.offset, value);
    this.offset += 4;
    if (0) this.comment(comment);
    return this;
  }
  // forward-looking lengths
  _writeLengthGeneric(lengthBytes, inclusive, comment) {
    this.ensureWriteAvailable(lengthBytes);
    const startOffset = this.offset;
    this.offset += lengthBytes;
    const endOffset = this.offset;
    this.indent += 1;
    this.indents[endOffset] = this.indent;
    return () => {
      const length = this.offset - (inclusive ? startOffset : endOffset);
      switch (lengthBytes) {
        case 1:
          this.dataView.setUint8(startOffset, length);
          break;
        case 2:
          this.dataView.setUint16(startOffset, length);
          break;
        case 3:
          this.dataView.setUint8(startOffset, (length & 16711680) >> 16);
          this.dataView.setUint16(startOffset + 1, length & 65535);
          break;
        case 4:
          this.dataView.setUint32(startOffset, length);
          break;
        default:
          throw new Error(`Invalid length for length field: ${lengthBytes}`);
      }
      this.indent -= 1;
      this.indents[this.offset] = this.indent;
    };
  }
  writeLengthUint8(comment) {
    return this._writeLengthGeneric(1, false, comment);
  }
  writeLengthUint16(comment) {
    return this._writeLengthGeneric(2, false, comment);
  }
  writeLengthUint24(comment) {
    return this._writeLengthGeneric(3, false, comment);
  }
  writeLengthUint32(comment) {
    return this._writeLengthGeneric(4, false, comment);
  }
  writeLengthUint8Incl(comment) {
    return this._writeLengthGeneric(1, true, comment);
  }
  writeLengthUint16Incl(comment) {
    return this._writeLengthGeneric(2, true, comment);
  }
  writeLengthUint24Incl(comment) {
    return this._writeLengthGeneric(3, true, comment);
  }
  writeLengthUint32Incl(comment) {
    return this._writeLengthGeneric(4, true, comment);
  }
  expectWriteLength(length, indentDelta = 1) {
    this.ensureWriteAvailable(length);
    return this.expectLength(length, indentDelta);
  }
  // output
  array() {
    return this.data.subarray(0, this.offset);
  }
  commentedString(all = false) {
    let indent = this.indents[0] ?? 0;
    let s = indentChars.repeat(indent);
    const len = all ? this.data.length : this.offset;
    for (let i = 0; i < len; i++) {
      s += hexLookup[this.data[i]];
      const comment = this.comments[i + 1];
      indent = this.indents[i + 1] ?? indent;
      if (comment) {
        s += ` ${comment}`;
        if (i < len - 1) s += `
${indentChars.repeat(indent)}`;
      }
    }
    return s;
  }
};
var cryptoPromise = typeof crypto !== "undefined" ? Promise.resolve(crypto) : (
  // browsers and Node 19+
  import("crypto").then((c) => c.webcrypto)
);
async function getRandomValues(...args) {
  const c = await cryptoPromise;
  return c.getRandomValues(...args);
}
__name(getRandomValues, "getRandomValues");
async function makeClientHello(host, publicKey, sessionId, useSNI = true) {
  const h = new Bytes();
  h.writeUint8(22, 0);
  h.writeUint16(769, 0);
  const endRecordHeader = h.writeLengthUint16("TLS record");
  h.writeUint8(1, 0);
  const endHandshakeHeader = h.writeLengthUint24();
  h.writeUint16(771, 0);
  await getRandomValues(h.subarrayForWrite(32));
  const endSessionId = h.writeLengthUint8(0);
  h.writeBytes(sessionId);
  endSessionId();
  const endCiphers = h.writeLengthUint16(0);
  h.writeUint16(4865, 0);
  endCiphers();
  const endCompressionMethods = h.writeLengthUint8(0);
  h.writeUint8(0, 0);
  endCompressionMethods();
  const endExtensions = h.writeLengthUint16(0);
  if (useSNI) {
    h.writeUint16(0, 0);
    const endSNIExt = h.writeLengthUint16(0);
    const endSNI = h.writeLengthUint16(0);
    h.writeUint8(0, 0);
    const endHostname = h.writeLengthUint16(0);
    h.writeUTF8String(host);
    endHostname();
    endSNI();
    endSNIExt();
  }
  h.writeUint16(11, 0);
  const endFormatTypesExt = h.writeLengthUint16(0);
  const endFormatTypes = h.writeLengthUint8(0);
  h.writeUint8(0, 0);
  endFormatTypes();
  endFormatTypesExt();
  h.writeUint16(10, 0);
  const endGroupsExt = h.writeLengthUint16(0);
  const endGroups = h.writeLengthUint16(0);
  h.writeUint16(23, 0);
  endGroups();
  endGroupsExt();
  h.writeUint16(13, 0);
  const endSigsExt = h.writeLengthUint16(0);
  const endSigs = h.writeLengthUint16(0);
  h.writeUint16(1027, 0);
  h.writeUint16(2052, 0);
  endSigs();
  endSigsExt();
  h.writeUint16(43, 0);
  const endVersionsExt = h.writeLengthUint16(0);
  const endVersions = h.writeLengthUint8(0);
  h.writeUint16(772, 0);
  endVersions();
  endVersionsExt();
  h.writeUint16(51, 0);
  const endKeyShareExt = h.writeLengthUint16(0);
  const endKeyShares = h.writeLengthUint16(0);
  h.writeUint16(23, 0);
  const endKeyShare = h.writeLengthUint16(0);
  if (0) {
    h.writeUint8(publicKey[0], "legacy point format: always 4, which means uncompressed ([RFC 8446 \xA74.2.8.2](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2.8.2) and [RFC 8422 \xA75.4.1](https://datatracker.ietf.org/doc/html/rfc8422#section-5.4.1))");
    h.writeBytes(publicKey.subarray(1, 33));
    h.comment("x coordinate");
    h.writeBytes(publicKey.subarray(33, 65));
    h.comment("y coordinate");
  } else {
    h.writeBytes(publicKey);
  }
  endKeyShare();
  endKeyShares();
  endKeyShareExt();
  endExtensions();
  endHandshakeHeader();
  endRecordHeader();
  return h;
}
__name(makeClientHello, "makeClientHello");
function u8FromHex(hex) {
  return new Uint8Array(Array.from(hex.matchAll(/[0-9a-f]/g)).map((hex2) => parseInt(hex2[0], 16)));
}
__name(u8FromHex, "u8FromHex");
function hexFromU8(u8, spacer = "") {
  if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
  if (spacer === "") return toHex(u8);
  if (spacer === " ") return toHexSpaced(u8);
  throw new Error("Spacer may only be empty or a single space");
}
__name(hexFromU8, "hexFromU8");
var te2 = new TextEncoder();
var td2 = new TextDecoder();
var littleEndian2 = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
var hexChars = te2.encode("0123456789abcdef");
var ccEvens = new Uint16Array(256);
var ccOdds = new Uint32Array(256);
if (littleEndian2) for (let i = 0; i < 256; i++) {
  ccEvens[i] = hexChars[i & 15] << 8 | hexChars[i >>> 4];
  ccOdds[i] = 32 << 16 | hexChars[i >>> 4] << 24 | hexChars[i & 15] | 32 << 8;
}
else for (let i = 0; i < 256; i++) {
  ccEvens[i] = hexChars[i & 15] | hexChars[i >>> 4] << 8;
  ccOdds[i] = 32 << 24 | hexChars[i >>> 4] << 16 | hexChars[i & 15] << 8 | 32;
}
function toHexSpaced(in8) {
  const bytes = in8.length;
  const out16 = new Uint16Array(bytes * 1.5 << 0);
  let outIndex = 0;
  for (let i = 0; i < bytes; i += 2) {
    out16[outIndex++] = ccEvens[in8[i]];
    const ccOdd = ccOdds[in8[i + 1]];
    out16[outIndex++] = ccOdd >>> 16;
    out16[outIndex++] = ccOdd & 65535;
  }
  const out8 = new Uint8Array(out16.buffer);
  return td2.decode(out8.subarray(0, bytes * 3 - 1));
}
__name(toHexSpaced, "toHexSpaced");
async function parseServerHello(h, sessionId) {
  let serverPublicKey;
  let tlsVersionSpecified;
  await h.expectUint8(2, 0);
  const [endServerHello] = await h.expectLengthUint24(0);
  await h.expectUint16(771, 0);
  const serverRandom = await h.readBytes(32);
  if (equal(serverRandom, [
    // SHA-256 of "HelloRetryRequest", https://datatracker.ietf.org/doc/html/rfc8446#page-32
    // see also: echo -n "HelloRetryRequest" | openssl dgst -sha256 -hex
    207,
    33,
    173,
    116,
    229,
    154,
    97,
    17,
    190,
    29,
    140,
    2,
    30,
    101,
    184,
    145,
    194,
    162,
    17,
    22,
    122,
    187,
    140,
    94,
    7,
    158,
    9,
    226,
    200,
    168,
    51,
    156
  ])) throw new Error("Unexpected HelloRetryRequest");
  await h.expectUint8(sessionId.length, 0);
  await h.expectBytes(sessionId, 0);
  await h.expectUint16(4865, 0);
  await h.expectUint8(0, 0);
  const [endExtensions, extensionsRemaining] = await h.expectLengthUint16(0);
  while (extensionsRemaining() > 0) {
    const extensionType = await h.readUint16(0);
    const [endExtension] = await h.expectLengthUint16(0);
    if (extensionType === 43) {
      await h.expectUint16(772, 0);
      tlsVersionSpecified = true;
    } else if (extensionType === 51) {
      await h.expectUint16(23, 0);
      const [endKeyShare, keyShareRemaining] = await h.expectLengthUint16("key share");
      const keyShareLength = keyShareRemaining();
      if (keyShareLength !== 65) throw new Error(`Expected 65 bytes of key share, but got ${keyShareLength}`);
      if (0) {
        await h.expectUint8(4, "legacy point format: always 4, which means uncompressed ([RFC 8446 \xA74.2.8.2](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2.8.2) and [RFC 8422 \xA75.4.1](https://datatracker.ietf.org/doc/html/rfc8422#section-5.4.1))");
        const x = await h.readBytes(32);
        h.comment("x coordinate");
        const y = await h.readBytes(32);
        h.comment("y coordinate");
        serverPublicKey = concat2([4], x, y);
      } else {
        serverPublicKey = await h.readBytes(keyShareLength);
      }
      endKeyShare();
    } else {
      throw new Error(`Unexpected extension 0x${hexFromU8([extensionType])}`);
    }
    endExtension();
  }
  endExtensions();
  endServerHello();
  if (tlsVersionSpecified !== true) throw new Error("No TLS version provided");
  if (serverPublicKey === void 0) throw new Error("No key provided");
  return serverPublicKey;
}
__name(parseServerHello, "parseServerHello");
var universalTypeBoolean = 1;
var universalTypeInteger = 2;
var constructedUniversalTypeSequence = 48;
var constructedUniversalTypeSet = 49;
var universalTypeOID = 6;
var universalTypePrintableString = 19;
var universalTypeTeletexString = 20;
var universalTypeUTF8String = 12;
var universalTypeIA5String = 22;
var universalTypeUTCTime = 23;
var universalTypeGeneralizedTime = 24;
var universalTypeNull = 5;
var universalTypeOctetString = 4;
var universalTypeBitString = 3;
var constructedContextSpecificType = 163;
var contextSpecificType = 128;
var DNOIDMap = {
  "2.5.4.6": "C",
  // country
  "2.5.4.10": "O",
  // organisation
  "2.5.4.11": "OU",
  // organisational unit
  "2.5.4.3": "CN",
  // common name
  "2.5.4.7": "L",
  // locality
  "2.5.4.8": "ST",
  // state/province
  "2.5.4.12": "T",
  // title
  "2.5.4.42": "GN",
  // given name
  "2.5.4.43": "I",
  // initials
  "2.5.4.4": "SN",
  // surname
  "1.2.840.113549.1.9.1": "MAIL",
  "2.5.4.5": "SERIALNUMBER"
};
function intFromBitString(bs) {
  const { length } = bs;
  if (length > 4) throw new Error(`Bit string length ${length} would overflow JS bit operators`);
  let result = 0;
  let leftShift = 0;
  for (let i = bs.length - 1; i >= 0; i--) {
    result |= bs[i] << leftShift;
    leftShift += 8;
  }
  return result;
}
__name(intFromBitString, "intFromBitString");
async function readSeqOfSetOfSeq(cb, seqType) {
  const result = {};
  const [endSeq, seqRemaining] = await cb.expectASN1Sequence(seqType);
  while (seqRemaining() > 0) {
    await cb.expectUint8(constructedUniversalTypeSet, 0);
    const [endItemSet] = await cb.expectASN1Length(0);
    const [endItemSeq] = await cb.expectASN1Sequence();
    const itemOID = await cb.readASN1OID();
    const itemName = DNOIDMap[itemOID] ?? itemOID;
    const valueType = await cb.readUint8();
    if (valueType === universalTypePrintableString) {
    } else if (valueType === universalTypeUTF8String) {
    } else if (valueType === universalTypeIA5String) {
    } else if (valueType === universalTypeTeletexString) {
    } else {
      throw new Error(`Unexpected item type in certificate ${seqType}: 0x${hexFromU8([valueType])}`);
    }
    const [endItemString, itemStringRemaining] = await cb.expectASN1Length(0);
    const itemValue = await cb.readUTF8String(itemStringRemaining());
    endItemString();
    endItemSeq();
    endItemSet();
    const existingValue = result[itemName];
    if (existingValue === void 0) result[itemName] = itemValue;
    else if (typeof existingValue === "string") result[itemName] = [existingValue, itemValue];
    else existingValue.push(itemValue);
  }
  endSeq();
  return result;
}
__name(readSeqOfSetOfSeq, "readSeqOfSetOfSeq");
async function readNamesSeq(cb, typeUnionBits = 0) {
  const names = [];
  const [endNamesSeq, namesSeqRemaining] = await cb.expectASN1Sequence(0);
  while (namesSeqRemaining() > 0) {
    const type = await cb.readUint8(0);
    const [endName, nameRemaining] = await cb.expectASN1Length(0);
    let name;
    if (type === (typeUnionBits | 2)) {
      name = await cb.readUTF8String(nameRemaining());
    } else {
      name = await cb.readBytes(nameRemaining());
    }
    names.push({ name, type });
    endName();
  }
  endNamesSeq();
  return names;
}
__name(readNamesSeq, "readNamesSeq");
function algorithmWithOID(oid) {
  const algo = {
    "1.2.840.113549.1.1.1": {
      name: "RSAES-PKCS1-v1_5"
    },
    "1.2.840.113549.1.1.5": {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: "SHA-1"
      }
    },
    "1.2.840.113549.1.1.11": {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: "SHA-256"
      }
    },
    "1.2.840.113549.1.1.12": {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: "SHA-384"
      }
    },
    "1.2.840.113549.1.1.13": {
      name: "RSASSA-PKCS1-v1_5",
      hash: {
        name: "SHA-512"
      }
    },
    "1.2.840.113549.1.1.10": {
      name: "RSA-PSS"
    },
    "1.2.840.113549.1.1.7": {
      name: "RSA-OAEP"
    },
    "1.2.840.10045.2.1": {
      // dupes
      name: "ECDSA",
      hash: {
        name: "SHA-1"
      }
    },
    "1.2.840.10045.4.1": {
      // dupes
      name: "ECDSA",
      hash: {
        name: "SHA-1"
      }
    },
    "1.2.840.10045.4.3.2": {
      name: "ECDSA",
      hash: {
        name: "SHA-256"
      }
    },
    "1.2.840.10045.4.3.3": {
      name: "ECDSA",
      hash: {
        name: "SHA-384"
      }
    },
    "1.2.840.10045.4.3.4": {
      name: "ECDSA",
      hash: {
        name: "SHA-512"
      }
    },
    "1.3.133.16.840.63.0.2": {
      name: "ECDH",
      kdf: "SHA-1"
    },
    "1.3.132.1.11.1": {
      name: "ECDH",
      kdf: "SHA-256"
    },
    "1.3.132.1.11.2": {
      name: "ECDH",
      kdf: "SHA-384"
    },
    "1.3.132.1.11.3": {
      name: "ECDH",
      kdf: "SHA-512"
    },
    "2.16.840.1.101.3.4.1.2": {
      name: "AES-CBC",
      length: 128
    },
    "2.16.840.1.101.3.4.1.22": {
      name: "AES-CBC",
      length: 192
    },
    "2.16.840.1.101.3.4.1.42": {
      name: "AES-CBC",
      length: 256
    },
    "2.16.840.1.101.3.4.1.6": {
      name: "AES-GCM",
      length: 128
    },
    "2.16.840.1.101.3.4.1.26": {
      name: "AES-GCM",
      length: 192
    },
    "2.16.840.1.101.3.4.1.46": {
      name: "AES-GCM",
      length: 256
    },
    "2.16.840.1.101.3.4.1.4": {
      name: "AES-CFB",
      length: 128
    },
    "2.16.840.1.101.3.4.1.24": {
      name: "AES-CFB",
      length: 192
    },
    "2.16.840.1.101.3.4.1.44": {
      name: "AES-CFB",
      length: 256
    },
    "2.16.840.1.101.3.4.1.5": {
      name: "AES-KW",
      length: 128
    },
    "2.16.840.1.101.3.4.1.25": {
      name: "AES-KW",
      length: 192
    },
    "2.16.840.1.101.3.4.1.45": {
      name: "AES-KW",
      length: 256
    },
    "1.2.840.113549.2.7": {
      name: "HMAC",
      hash: {
        name: "SHA-1"
      }
    },
    "1.2.840.113549.2.9": {
      name: "HMAC",
      hash: {
        name: "SHA-256"
      }
    },
    "1.2.840.113549.2.10": {
      name: "HMAC",
      hash: {
        name: "SHA-384"
      }
    },
    "1.2.840.113549.2.11": {
      name: "HMAC",
      hash: {
        name: "SHA-512"
      }
    },
    "1.2.840.113549.1.9.16.3.5": {
      name: "DH"
    },
    "1.3.14.3.2.26": {
      name: "SHA-1"
    },
    "2.16.840.1.101.3.4.2.1": {
      name: "SHA-256"
    },
    "2.16.840.1.101.3.4.2.2": {
      name: "SHA-384"
    },
    "2.16.840.1.101.3.4.2.3": {
      name: "SHA-512"
    },
    "1.2.840.113549.1.5.12": {
      name: "PBKDF2"
    },
    // special case: OIDs for ECC curves
    "1.2.840.10045.3.1.7": {
      name: "P-256"
    },
    "1.3.132.0.34": {
      name: "P-384"
    },
    "1.3.132.0.35": {
      name: "P-521"
    }
  }[oid];
  if (algo === void 0) throw new Error(`Unsupported algorithm identifier: ${oid}`);
  return algo;
}
__name(algorithmWithOID, "algorithmWithOID");
function _descriptionForAlgorithm(algo, desc = []) {
  Object.values(algo).forEach((value) => {
    if (typeof value === "string") desc = [...desc, value];
    else desc = _descriptionForAlgorithm(value, desc);
  });
  return desc;
}
__name(_descriptionForAlgorithm, "_descriptionForAlgorithm");
function descriptionForAlgorithm(algo) {
  return _descriptionForAlgorithm(algo).join(" / ");
}
__name(descriptionForAlgorithm, "descriptionForAlgorithm");
var ASN1Bytes = class extends Bytes {
  static {
    __name(this, "ASN1Bytes");
  }
  async readASN1Length(comment) {
    const byte1 = await this.readUint8();
    if (byte1 < 128) {
      return byte1;
    }
    const lengthBytes = byte1 & 127;
    const fullComment = 0;
    if (lengthBytes === 1) return this.readUint8(fullComment);
    if (lengthBytes === 2) return this.readUint16(fullComment);
    if (lengthBytes === 3) return this.readUint24(fullComment);
    if (lengthBytes === 4) return this.readUint32(fullComment);
    throw new Error(`ASN.1 length fields are only supported up to 4 bytes (this one is ${lengthBytes} bytes)`);
  }
  async expectASN1Length(comment) {
    const length = await this.readASN1Length(comment);
    return this.expectReadLength(length);
  }
  async expectASN1TypeAndLength(typeNum, typeDesc, comment) {
    await this.expectUint8(typeNum, 0);
    return this.expectASN1Length(0);
  }
  async readASN1OID(comment) {
    const [endOID, OIDRemaining] = await this.expectASN1TypeAndLength(universalTypeOID, "OID", comment);
    const byte1 = await this.readUint8();
    let oid = `${Math.floor(byte1 / 40)}.${byte1 % 40}`;
    while (OIDRemaining() > 0) {
      let value = 0;
      while (true) {
        const nextByte = await this.readUint8();
        value <<= 7;
        value += nextByte & 127;
        if (nextByte < 128) break;
      }
      oid += `.${value}`;
    }
    endOID();
    return oid;
  }
  async readASN1Boolean(comment) {
    const [endBoolean, booleanRemaining] = await this.expectASN1TypeAndLength(
      universalTypeBoolean,
      "boolean",
      comment
    );
    const length = booleanRemaining();
    if (length !== 1) throw new Error(`Boolean has unexpected length: ${length}`);
    const byte = await this.readUint8();
    const result = {
      255: true,
      0: false
    }[byte];
    if (result === void 0) throw new Error(`Boolean has unexpected value: 0x${hexFromU8([byte])}`);
    endBoolean();
    return result;
  }
  async readASN1UTCTime(comment) {
    const [endTime, timeRemaining] = await this.expectASN1TypeAndLength(universalTypeUTCTime, "UTC time", comment);
    const timeStr = await this.readUTF8String(timeRemaining());
    const parts = timeStr.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/);
    if (!parts) throw new Error("Unrecognised ASN.1 UTC time format");
    const [, yr2dstr, mth, dy, hr, min, sec] = parts;
    const yr2d = parseInt(yr2dstr, 10);
    const yr = yr2d + (yr2d >= 50 ? 1900 : 2e3);
    const time = /* @__PURE__ */ new Date(`${yr}-${mth}-${dy}T${hr}:${min}:${sec}Z`);
    endTime();
    return time;
  }
  async readASN1GeneralizedTime(comment) {
    const [endTime, timeRemaining] = await this.expectASN1TypeAndLength(universalTypeGeneralizedTime, "generalized time", comment);
    const timeStr = await this.readUTF8String(timeRemaining());
    const parts = timeStr.match(/^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})?([0-9]{2})?([.][0-9]+)?(Z)?([-+][0-9]+)?$/);
    if (!parts) throw new Error("Unrecognised ASN.1 generalized time format");
    const [, yr, mth, dy, hr, min, sec, fracsec, z, tz] = parts;
    if (sec === void 0 && fracsec !== void 0) throw new Error("Invalid ASN.1 generalized time format (fraction without seconds)");
    if (z !== void 0 && tz !== void 0) throw new Error("Invalid ASN.1 generalized time format (Z and timezone)");
    const time = /* @__PURE__ */ new Date(`${yr}-${mth}-${dy}T${hr}:${min ?? "00"}:${sec ?? "00"}${fracsec ?? ""}${tz ?? "Z"}`);
    endTime();
    return time;
  }
  async readASN1Time(comment) {
    const startTimeType = await this.readUint8();
    this.offset--;
    let t;
    if (startTimeType === universalTypeUTCTime) {
      t = await this.readASN1UTCTime(comment);
    } else if (startTimeType === universalTypeGeneralizedTime) {
      t = await this.readASN1GeneralizedTime(comment);
    } else {
      throw new Error(`Expected time type but got 0x${hexFromU8([startTimeType])}`);
    }
    return t;
  }
  async readASN1BitString(comment) {
    const [endBitString, bitStringRemaining] = await this.expectASN1TypeAndLength(universalTypeBitString, "bitstring", comment);
    const rightPadBits = await this.readUint8(0);
    const bytesLength = bitStringRemaining();
    const bitString = await this.readBytes(bytesLength);
    if (rightPadBits > 7) throw new Error(`Invalid right pad value: ${rightPadBits}`);
    if (rightPadBits > 0) {
      const leftPadNext = 8 - rightPadBits;
      for (let i = bytesLength - 1; i > 0; i--) {
        bitString[i] = 255 & bitString[i - 1] << leftPadNext | bitString[i] >>> rightPadBits;
      }
      bitString[0] = bitString[0] >>> rightPadBits;
    }
    endBitString();
    comment && this.comment(comment);
    return bitString;
  }
  async expectASN1Sequence(comment) {
    return this.expectASN1TypeAndLength(constructedUniversalTypeSequence, "sequence", comment);
  }
  async expectASN1OctetString(comment) {
    return this.expectASN1TypeAndLength(universalTypeOctetString, "octet string", comment);
  }
  async expectASN1DERDoc() {
    return this.expectASN1OctetString(0);
  }
  async expectASN1Null(comment) {
    const [endNull] = await this.expectASN1TypeAndLength(universalTypeNull, "null", comment);
    endNull();
  }
};
var regex = new RegExp(`  .+|^(${indentChars})+`, "gm");
async function parseSessionTicket(record) {
  if (0) {
    const ticket = new Bytes2(record);
    await ticket.expectUint8(4, "session ticket message, per [RFC 8846 \xA74.6.1](https://datatracker.ietf.org/doc/html/rfc8446#section-4.6.1) (we do nothing with these)");
    const [endTicketRecord] = await ticket.expectLengthUint24("session ticket message");
    const ticketSeconds = await ticket.readUint32();
    ticket.comment(`ticket lifetime in seconds: ${ticketSeconds} = ${ticketSeconds / 3600} hours`);
    await ticket.readUint32("ticket age add");
    const [endTicketNonce, ticketNonceRemaining] = await ticket.expectLengthUint8("ticket nonce");
    await ticket.readBytes(ticketNonceRemaining());
    ticket.comment("ticket nonce");
    endTicketNonce();
    const [endTicket, ticketRemaining] = await ticket.expectLengthUint16("ticket");
    await ticket.readBytes(ticketRemaining());
    ticket.comment("ticket");
    endTicket();
    const [endTicketExts, ticketExtsRemaining] = await ticket.expectLengthUint16("ticket extensions");
    if (ticketExtsRemaining() > 0) {
      await ticket.readBytes(ticketExtsRemaining());
      ticket.comment("ticket extensions (ignored)");
    }
    endTicketExts();
    endTicketRecord();
    log(...highlightBytes(ticket.commentedString(), LogColours.server));
  }
}
__name(parseSessionTicket, "parseSessionTicket");
var ReadQueue = class {
  static {
    __name(this, "ReadQueue");
  }
  constructor() {
    __publicField(this, "queue");
    __publicField(this, "outstandingRequest");
    this.queue = [];
  }
  enqueue(data) {
    this.queue.push(data);
    this.dequeue();
  }
  dequeue() {
    if (this.outstandingRequest === void 0) return;
    const { resolve, bytes: requestedBytes, readMode } = this.outstandingRequest;
    const bytesInQueue = this.bytesInQueue();
    if (bytesInQueue < requestedBytes && this.moreDataMayFollow()) return;
    const bytes = Math.min(requestedBytes, bytesInQueue);
    if (bytes === 0) {
      resolve(void 0);
      return;
    }
    this.outstandingRequest = void 0;
    const firstItem = this.queue[0];
    const firstItemLength = firstItem.length;
    if (firstItemLength === bytes) {
      if (readMode === 0) this.queue.shift();
      resolve(firstItem);
      return;
    }
    if (firstItemLength > bytes) {
      if (readMode === 0) this.queue[0] = firstItem.subarray(bytes);
      resolve(firstItem.subarray(0, bytes));
      return;
    }
    const result = new Uint8Array(bytes);
    let outstandingBytes = bytes;
    let offset = 0;
    let itemsConsumed = 0;
    while (outstandingBytes > 0) {
      const nextItem = this.queue[itemsConsumed];
      const nextItemLength = nextItem.length;
      if (nextItemLength <= outstandingBytes) {
        itemsConsumed++;
        result.set(nextItem, offset);
        offset += nextItemLength;
        outstandingBytes -= nextItemLength;
      } else {
        if (readMode === 0) this.queue[itemsConsumed] = nextItem.subarray(outstandingBytes);
        result.set(nextItem.subarray(0, outstandingBytes), offset);
        outstandingBytes -= outstandingBytes;
        offset += outstandingBytes;
      }
    }
    if (readMode === 0) this.queue.splice(0, itemsConsumed);
    resolve(result);
  }
  bytesInQueue() {
    return this.queue.reduce((memo, arr) => memo + arr.length, 0);
  }
  async read(bytes, readMode = 0) {
    if (this.outstandingRequest !== void 0) throw new Error("Can\u2019t read while already awaiting read");
    return new Promise((resolve) => {
      this.outstandingRequest = { resolve, bytes, readMode };
      this.dequeue();
    });
  }
};
var LazyReadFunctionReadQueue = class extends ReadQueue {
  static {
    __name(this, "LazyReadFunctionReadQueue");
  }
  constructor(readFn) {
    super();
    this.readFn = readFn;
    __publicField(this, "dataIsExhausted", false);
  }
  async read(bytes, readMode = 0) {
    while (this.bytesInQueue() < bytes) {
      const data = await this.readFn();
      if (data === void 0) {
        this.dataIsExhausted = true;
        break;
      }
      if (data.length > 0) this.enqueue(data);
    }
    return super.read(bytes, readMode);
  }
  moreDataMayFollow() {
    return !this.dataIsExhausted;
  }
};
var RecordTypeName = {
  [
    20
    /* ChangeCipherSpec */
  ]: "ChangeCipherSpec",
  [
    21
    /* Alert */
  ]: "Alert",
  [
    22
    /* Handshake */
  ]: "Handshake",
  [
    23
    /* Application */
  ]: "Application",
  [
    24
    /* Heartbeat */
  ]: "Heartbeat"
};
var maxPlaintextRecordLength = 1 << 14;
var maxCiphertextRecordLength = maxPlaintextRecordLength + 1 + 255;
async function readTlsRecord(read, expectedType, maxLength = maxPlaintextRecordLength) {
  const nextByte = await read(
    1,
    1
    /* PEEK */
  );
  if (nextByte === void 0) return;
  const record = new Bytes(read);
  const type = await record.readUint8();
  if (!(type in RecordTypeName)) throw new Error(`Illegal TLS record type 0x${type.toString(16)}`);
  await record.expectUint16(771, "TLS record version 1.2 (middlebox compatibility)");
  const [, recordRemaining] = await record.expectLengthUint16("TLS record");
  const length = recordRemaining();
  if (length > maxLength) throw new Error(`Record too long: ${length} bytes`);
  let alertLevel;
  if (type === 21) {
    alertLevel = await record.readUint8(0);
    const desc = await record.readUint8(0);
  }
  if (alertLevel === 2) throw new Error("Fatal alert message received");
  else if (alertLevel === 1) return readTlsRecord(read, expectedType, maxLength);
  if (expectedType !== void 0 && type !== expectedType) throw new Error(`Unexpected TLS record type 0x${type.toString(
    16
  ).padStart(2, "0")} (expected 0x${expectedType.toString(16).padStart(2, "0")})`);
  const rawHeader = record.array();
  const content = await record.subarrayForRead(length);
  return { type, length, content, rawHeader };
}
__name(readTlsRecord, "readTlsRecord");
function bytesFromTlsRecords(read, expectedType) {
  const readQueue = new LazyReadFunctionReadQueue(async () => {
    const record = await readTlsRecord(read, expectedType);
    return record?.content;
  });
  const bytes = new ASN1Bytes(readQueue.read.bind(readQueue), 1);
  return bytes;
}
__name(bytesFromTlsRecords, "bytesFromTlsRecords");
async function readEncryptedTlsRecord(read, decrypter, expectedType) {
  const encryptedRecord = await readTlsRecord(read, 23, maxCiphertextRecordLength);
  if (encryptedRecord === void 0) return;
  const encryptedBytes = new Bytes(encryptedRecord.content, 1);
  await encryptedBytes.skipRead(encryptedRecord.length - 16, 0);
  await encryptedBytes.skipRead(16, 0);
  const decryptedRecord = await decrypter.process(encryptedRecord.content, 16, encryptedRecord.rawHeader);
  let recordTypeIndex = decryptedRecord.length - 1;
  while (decryptedRecord[recordTypeIndex] === 0) recordTypeIndex -= 1;
  if (recordTypeIndex < 0) throw new Error("Decrypted message has no record type indicator (all zeroes)");
  const type = decryptedRecord[recordTypeIndex];
  const record = decryptedRecord.subarray(
    0,
    recordTypeIndex
    /* exclusive */
  );
  if (type === 21) {
    const closeNotify = record.length === 2 && record[0] === 1 && record[1] === 0;
    if (closeNotify) return void 0;
  }
  if (type === 22 && record[0] === 4) {
    await parseSessionTicket(record);
    return readEncryptedTlsRecord(read, decrypter, expectedType);
  }
  if (expectedType !== void 0 && type !== expectedType) throw new Error(`Unexpected TLS record type 0x${type.toString(
    16
  ).padStart(2, "0")} (expected 0x${expectedType.toString(16).padStart(2, "0")})`);
  return record;
}
__name(readEncryptedTlsRecord, "readEncryptedTlsRecord");
function bytesFromEncryptedTlsRecords(read, decrypter, expectedType) {
  const readQueue = new LazyReadFunctionReadQueue(async () => {
    const record = await readEncryptedTlsRecord(read, decrypter, expectedType);
    return record;
  });
  const bytes = new ASN1Bytes(readQueue.read.bind(readQueue));
  return bytes;
}
__name(bytesFromEncryptedTlsRecords, "bytesFromEncryptedTlsRecords");
async function makeEncryptedTlsRecord(plaintext, encrypter, type) {
  const data = concat(plaintext, [type]);
  const headerLength = 5;
  const dataLength = data.length;
  const authTagLength = 16;
  const payloadLength = dataLength + authTagLength;
  const encryptedRecord = new Bytes(headerLength + payloadLength);
  encryptedRecord.writeUint8(23, 0);
  encryptedRecord.writeUint16(771, 0);
  encryptedRecord.writeUint16(payloadLength, `${payloadLength} bytes follow`);
  const [endEncryptedRecord] = encryptedRecord.expectWriteLength(payloadLength);
  const header = encryptedRecord.array();
  const encryptedData = await encrypter.process(data, 16, header);
  encryptedRecord.writeBytes(encryptedData.subarray(0, encryptedData.length - 16));
  encryptedRecord.writeBytes(encryptedData.subarray(encryptedData.length - 16));
  endEncryptedRecord();
  return encryptedRecord.array();
}
__name(makeEncryptedTlsRecord, "makeEncryptedTlsRecord");
async function makeEncryptedTlsRecords(plaintext, encrypter, type) {
  const recordCount = Math.ceil(plaintext.length / maxPlaintextRecordLength);
  const encryptedRecords = [];
  for (let i = 0; i < recordCount; i++) {
    const data = plaintext.subarray(i * maxPlaintextRecordLength, (i + 1) * maxPlaintextRecordLength);
    const encryptedRecord = await makeEncryptedTlsRecord(data, encrypter, type);
    encryptedRecords.push(encryptedRecord);
  }
  return encryptedRecords;
}
__name(makeEncryptedTlsRecords, "makeEncryptedTlsRecords");
var subtleCrypto = typeof crypto !== "undefined" && crypto.subtle !== void 0 ? Promise.resolve(crypto.subtle) : (
  // browsers and Node 19+
  import("crypto").then((c) => c.webcrypto.subtle)
);
function subtleCryptoMethod(method, args) {
  return subtleCrypto.then((cs) => cs[method](...args));
}
__name(subtleCryptoMethod, "subtleCryptoMethod");
var cryptoProxy_default = new Proxy({}, {
  get(target, property) {
    return (...args) => subtleCryptoMethod(property, args);
  }
});
var txtEnc2 = new TextEncoder();
async function hkdfExtract(salt, keyMaterial, hashBits) {
  const hmacKey = await cryptoProxy_default.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: { name: `SHA-${hashBits}` } },
    false,
    ["sign"]
  );
  const prk = new Uint8Array(await cryptoProxy_default.sign("HMAC", hmacKey, keyMaterial));
  return prk;
}
__name(hkdfExtract, "hkdfExtract");
async function hkdfExpand(key, info, length, hashBits) {
  const hashBytes = hashBits >> 3;
  const n = Math.ceil(length / hashBytes);
  const okm = new Uint8Array(n * hashBytes);
  const hmacKey = await cryptoProxy_default.importKey(
    "raw",
    key,
    { name: "HMAC", hash: { name: `SHA-${hashBits}` } },
    false,
    ["sign"]
  );
  let tPrev = new Uint8Array(0);
  for (let i = 0; i < n; i++) {
    const hmacData = concat(tPrev, info, [i + 1]);
    const tiBuffer = await cryptoProxy_default.sign("HMAC", hmacKey, hmacData);
    const ti = new Uint8Array(tiBuffer);
    okm.set(ti, hashBytes * i);
    tPrev = ti;
  }
  return okm.subarray(0, length);
}
__name(hkdfExpand, "hkdfExpand");
var tls13_Bytes = txtEnc2.encode("tls13 ");
async function hkdfExpandLabel(key, label, context, length, hashBits) {
  const labelData = txtEnc2.encode(label);
  const hkdfLabel = concat(
    [(length & 65280) >> 8, length & 255],
    [tls13_Bytes.length + labelData.length],
    tls13_Bytes,
    labelData,
    [context.length],
    context
  );
  return hkdfExpand(key, hkdfLabel, length, hashBits);
}
__name(hkdfExpandLabel, "hkdfExpandLabel");
async function getHandshakeKeys(serverPublicKey, privateKey, hellos, hashBits, keyLength) {
  const hashBytes = hashBits >>> 3;
  const zeroKey = new Uint8Array(hashBytes);
  const publicKey = await cryptoProxy_default.importKey("raw", serverPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecretBuffer = await cryptoProxy_default.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBuffer);
  const hellosHashBuffer = await cryptoProxy_default.digest("SHA-256", hellos);
  const hellosHash = new Uint8Array(hellosHashBuffer);
  const earlySecret = await hkdfExtract(new Uint8Array(1), zeroKey, hashBits);
  const emptyHashBuffer = await cryptoProxy_default.digest(`SHA-${hashBits}`, new Uint8Array(0));
  const emptyHash = new Uint8Array(emptyHashBuffer);
  const derivedSecret = await hkdfExpandLabel(earlySecret, "derived", emptyHash, hashBytes, hashBits);
  const handshakeSecret = await hkdfExtract(derivedSecret, sharedSecret, hashBits);
  const clientSecret = await hkdfExpandLabel(handshakeSecret, "c hs traffic", hellosHash, hashBytes, hashBits);
  const serverSecret = await hkdfExpandLabel(handshakeSecret, "s hs traffic", hellosHash, hashBytes, hashBits);
  const clientHandshakeKey = await hkdfExpandLabel(clientSecret, "key", new Uint8Array(0), keyLength, hashBits);
  const serverHandshakeKey = await hkdfExpandLabel(serverSecret, "key", new Uint8Array(0), keyLength, hashBits);
  const clientHandshakeIV = await hkdfExpandLabel(clientSecret, "iv", new Uint8Array(0), 12, hashBits);
  const serverHandshakeIV = await hkdfExpandLabel(serverSecret, "iv", new Uint8Array(0), 12, hashBits);
  return {
    serverHandshakeKey,
    serverHandshakeIV,
    clientHandshakeKey,
    clientHandshakeIV,
    handshakeSecret,
    clientSecret,
    serverSecret
  };
}
__name(getHandshakeKeys, "getHandshakeKeys");
async function getApplicationKeys(handshakeSecret, handshakeHash, hashBits, keyLength) {
  const hashBytes = hashBits >>> 3;
  const zeroKey = new Uint8Array(hashBytes);
  const emptyHashBuffer = await cryptoProxy_default.digest(`SHA-${hashBits}`, new Uint8Array(0));
  const emptyHash = new Uint8Array(emptyHashBuffer);
  const derivedSecret = await hkdfExpandLabel(handshakeSecret, "derived", emptyHash, hashBytes, hashBits);
  const masterSecret = await hkdfExtract(derivedSecret, zeroKey, hashBits);
  const clientSecret = await hkdfExpandLabel(masterSecret, "c ap traffic", handshakeHash, hashBytes, hashBits);
  const serverSecret = await hkdfExpandLabel(masterSecret, "s ap traffic", handshakeHash, hashBytes, hashBits);
  const clientApplicationKey = await hkdfExpandLabel(clientSecret, "key", new Uint8Array(0), keyLength, hashBits);
  const serverApplicationKey = await hkdfExpandLabel(serverSecret, "key", new Uint8Array(0), keyLength, hashBits);
  const clientApplicationIV = await hkdfExpandLabel(clientSecret, "iv", new Uint8Array(0), 12, hashBits);
  const serverApplicationIV = await hkdfExpandLabel(serverSecret, "iv", new Uint8Array(0), 12, hashBits);
  return { serverApplicationKey, serverApplicationIV, clientApplicationKey, clientApplicationIV };
}
__name(getApplicationKeys, "getApplicationKeys");
var Crypter = class {
  static {
    __name(this, "Crypter");
  }
  constructor(mode, key, initialIv) {
    this.mode = mode;
    this.key = key;
    this.initialIv = initialIv;
    __publicField(this, "recordsProcessed", 0n);
    __publicField(this, "priorPromise", Promise.resolve(new Uint8Array()));
  }
  // The `Promise`s returned by successive calls to this function always resolve in sequence,
  // which is not true for `processUnsequenced` in Node (even if it seems to be in browsers)
  async process(data, authTagLength, additionalData) {
    return this.sequence(this.processUnsequenced(data, authTagLength, additionalData));
  }
  async sequence(promise) {
    const sequenced = this.priorPromise.then(() => promise);
    this.priorPromise = sequenced;
    return sequenced;
  }
  // data is plainText for encrypt, concat(ciphertext, authTag) for decrypt
  async processUnsequenced(data, authTagByteLength, additionalData) {
    const recordIndex = this.recordsProcessed;
    this.recordsProcessed += 1n;
    const iv = this.initialIv.slice();
    const ivLength = BigInt(iv.length);
    const lastIndex = ivLength - 1n;
    for (let i = 0n; i < ivLength; i++) {
      const shifted = recordIndex >> (i << 3n);
      if (shifted === 0n) break;
      iv[Number(lastIndex - i)] ^= Number(shifted & 0xffn);
    }
    const authTagBitLength = authTagByteLength << 3;
    const algorithm = { name: "AES-GCM", iv, tagLength: authTagBitLength, additionalData };
    const resultBuffer = await cryptoProxy_default[this.mode](algorithm, this.key, data);
    const result = new Uint8Array(resultBuffer);
    return result;
  }
};
var allKeyUsages = [
  // https://www.rfc-editor.org/rfc/rfc3280#section-4.2.1.3
  "digitalSignature",
  // (0)
  "nonRepudiation",
  // (1)
  "keyEncipherment",
  // (2)
  "dataEncipherment",
  // (3)
  "keyAgreement",
  // (4)
  "keyCertSign",
  // (5)
  "cRLSign",
  // (6)
  "encipherOnly",
  // (7)
  "decipherOnly"
  // (8)
];
var Cert = class _Cert {
  static {
    __name(this, "_Cert");
  }
  constructor() {
    __publicField(this, "serialNumber");
    __publicField(this, "algorithm");
    __publicField(this, "issuer");
    __publicField(this, "validityPeriod");
    __publicField(this, "subject");
    __publicField(this, "publicKey");
    __publicField(this, "signature");
    __publicField(this, "keyUsage");
    __publicField(this, "subjectAltNames");
    __publicField(this, "extKeyUsage");
    __publicField(this, "authorityKeyIdentifier");
    __publicField(this, "subjectKeyIdentifier");
    __publicField(this, "basicConstraints");
    __publicField(this, "signedData");
    __publicField(this, "rawData");
    throw new Error("Use `await Cert.create(...)`, not `new Cert(...)`");
  }
  static distinguishedNamesAreEqual(dn1, dn2) {
    return this.stringFromDistinguishedName(dn1) === this.stringFromDistinguishedName(dn2);
  }
  static stringFromDistinguishedName(dn) {
    return Object.entries(dn).map(
      ([k, vs]) => typeof vs === "string" ? `${k}=${vs.trim().replace(/[\\,]/g, "\\$&")}` : vs.map((v) => `${k}=${v.trim().replace(/[\\,]/g, "\\$&")}`).join(", ")
    ).join(", ");
  }
  static async create(certData) {
    const cert = Object.create(this.prototype);
    if (certData instanceof ASN1Bytes || certData instanceof Uint8Array) {
      const cb = certData instanceof ASN1Bytes ? certData : new ASN1Bytes(certData);
      const certSeqStartOffset = cb.offset;
      const [endCertSeq] = await cb.expectASN1Sequence(0);
      const tbsCertStartOffset = cb.offset;
      const [endCertInfoSeq] = await cb.expectASN1Sequence(0);
      await cb.expectBytes([160, 3, 2, 1, 2], 0);
      await cb.expectUint8(universalTypeInteger, 0);
      const [endSerialNumber, serialNumberRemaining] = await cb.expectASN1Length(0);
      cert.serialNumber = await cb.subarrayForRead(serialNumberRemaining());
      endSerialNumber();
      const [endAlgo, algoRemaining] = await cb.expectASN1Sequence(0);
      cert.algorithm = await cb.readASN1OID();
      if (algoRemaining() > 0) {
        await cb.expectASN1Null("no algorithm parameters");
      }
      endAlgo();
      cert.issuer = await readSeqOfSetOfSeq(cb, 0);
      const [endValiditySeq] = await cb.expectASN1Sequence(0);
      const notBefore = await cb.readASN1Time(0);
      const notAfter = await cb.readASN1Time(0);
      cert.validityPeriod = { notBefore, notAfter };
      endValiditySeq();
      cert.subject = await readSeqOfSetOfSeq(cb, 0);
      const publicKeyStartOffset = cb.offset;
      const [endPublicKeySeq] = await cb.expectASN1Sequence(0);
      const [endKeyOID, keyOIDRemaining] = await cb.expectASN1Sequence(0);
      const publicKeyOIDs = [];
      while (keyOIDRemaining() > 0) {
        const keyParamRecordType = await cb.readUint8();
        cb.offset--;
        if (keyParamRecordType === universalTypeOID) {
          const keyOID = await cb.readASN1OID();
          publicKeyOIDs.push(keyOID);
        } else if (keyParamRecordType === universalTypeNull) {
          await cb.expectASN1Null();
        }
      }
      endKeyOID();
      const publicKeyData = await cb.readASN1BitString();
      cert.publicKey = { identifiers: publicKeyOIDs, data: publicKeyData, all: cb.data.subarray(
        publicKeyStartOffset,
        cb.offset
      ) };
      endPublicKeySeq();
      await cb.expectUint8(constructedContextSpecificType, 0);
      const [endExtsData] = await cb.expectASN1Length();
      const [endExts, extsRemaining] = await cb.expectASN1Sequence(0);
      while (extsRemaining() > 0) {
        const [endExt, extRemaining] = await cb.expectASN1Sequence(0);
        const extOID = await cb.readASN1OID("extension type");
        if (extOID === "2.5.29.17") {
          const [endSanDerDoc] = await cb.expectASN1DERDoc();
          const allSubjectAltNames = await readNamesSeq(cb, contextSpecificType);
          cert.subjectAltNames = allSubjectAltNames.filter((san) => san.type === (2 | contextSpecificType)).map((san) => san.name);
          endSanDerDoc();
        } else if (extOID === "2.5.29.15") {
          let keyUsageCritical;
          let nextType = await cb.readUint8();
          cb.offset--;
          if (nextType === universalTypeBoolean) {
            keyUsageCritical = await cb.readASN1Boolean(0);
            nextType = await cb.readUint8();
            cb.offset--;
          }
          const [endKeyUsageDer] = await cb.expectASN1DERDoc();
          const keyUsageBitStr = await cb.readASN1BitString();
          const keyUsageBitmask = intFromBitString(keyUsageBitStr);
          const keyUsageNames = new Set(allKeyUsages.filter((u, i) => keyUsageBitmask & 1 << i));
          endKeyUsageDer();
          cert.keyUsage = {
            critical: keyUsageCritical,
            usages: keyUsageNames
          };
        } else if (extOID === "2.5.29.37") {
          cert.extKeyUsage = {};
          const [endExtKeyUsageDer] = await cb.expectASN1DERDoc();
          const [endExtKeyUsage, extKeyUsageRemaining] = await cb.expectASN1Sequence(0);
          while (extKeyUsageRemaining() > 0) {
            const extKeyUsageOID = await cb.readASN1OID();
            if (extKeyUsageOID === "1.3.6.1.5.5.7.3.1") cert.extKeyUsage.serverTls = true;
            if (extKeyUsageOID === "1.3.6.1.5.5.7.3.2") cert.extKeyUsage.clientTls = true;
          }
          endExtKeyUsage();
          endExtKeyUsageDer();
        } else if (extOID === "2.5.29.35") {
          const [endAuthKeyIdDer] = await cb.expectASN1DERDoc();
          const [endAuthKeyIdSeq, authKeyIdSeqRemaining] = await cb.expectASN1Sequence();
          while (authKeyIdSeqRemaining() > 0) {
            const authKeyIdDatumType = await cb.readUint8();
            if (authKeyIdDatumType === (contextSpecificType | 0)) {
              const [endAuthKeyId, authKeyIdRemaining] = await cb.expectASN1Length(0);
              cert.authorityKeyIdentifier = await cb.readBytes(authKeyIdRemaining());
              endAuthKeyId();
            } else if (authKeyIdDatumType === (contextSpecificType | 1)) {
              const [endAuthKeyIdCertIssuer, authKeyIdCertIssuerRemaining] = await cb.expectASN1Length(0);
              await cb.skipRead(authKeyIdCertIssuerRemaining(), 0);
              endAuthKeyIdCertIssuer();
            } else if (authKeyIdDatumType === (contextSpecificType | 2)) {
              const [endAuthKeyIdCertSerialNo, authKeyIdCertSerialNoRemaining] = await cb.expectASN1Length(0);
              await cb.skipRead(authKeyIdCertSerialNoRemaining(), 0);
              endAuthKeyIdCertSerialNo();
            } else if (authKeyIdDatumType === (contextSpecificType | 33)) {
              const [endDirName, dirNameRemaining] = await cb.expectASN1Length(0);
              await cb.skipRead(dirNameRemaining(), 0);
              endDirName();
            } else {
              throw new Error(`Unexpected data type ${authKeyIdDatumType} in authorityKeyIdentifier certificate extension`);
            }
          }
          endAuthKeyIdSeq();
          endAuthKeyIdDer();
        } else if (extOID === "2.5.29.14") {
          const [endSubjectKeyIdDer] = await cb.expectASN1DERDoc();
          const [endSubjectKeyId, subjectKeyIdRemaining] = await cb.expectASN1OctetString("subject key identifier");
          cert.subjectKeyIdentifier = await cb.readBytes(subjectKeyIdRemaining());
          endSubjectKeyId();
          endSubjectKeyIdDer();
        } else if (extOID === "2.5.29.19") {
          let basicConstraintsCritical;
          let bcNextType = await cb.readUint8();
          cb.offset--;
          if (bcNextType === universalTypeBoolean) {
            basicConstraintsCritical = await cb.readASN1Boolean(0);
            bcNextType = await cb.readUint8();
            cb.offset--;
          }
          const [endBasicConstraintsDer] = await cb.expectASN1DERDoc();
          const [endConstraintsSeq, constraintsSeqRemaining] = await cb.expectASN1Sequence();
          let basicConstraintsCa = void 0;
          if (constraintsSeqRemaining() > 0) {
            basicConstraintsCa = await cb.readASN1Boolean(0);
          }
          let basicConstraintsPathLength;
          if (constraintsSeqRemaining() > 0) {
            await cb.expectUint8(universalTypeInteger, 0);
            const maxPathLengthLength = await cb.readASN1Length(0);
            basicConstraintsPathLength = maxPathLengthLength === 1 ? await cb.readUint8() : maxPathLengthLength === 2 ? await cb.readUint16() : maxPathLengthLength === 3 ? await cb.readUint24() : void 0;
            if (basicConstraintsPathLength === void 0) throw new Error("Too many bytes in max path length in certificate basicConstraints");
          }
          endConstraintsSeq();
          endBasicConstraintsDer();
          cert.basicConstraints = {
            critical: basicConstraintsCritical,
            ca: basicConstraintsCa,
            pathLength: basicConstraintsPathLength
          };
        } else if (0) {
          const [endAuthInfoAccessDER] = await cb.expectASN1DERDoc();
          const [endAuthInfoAccessSeq, authInfoAccessSeqRemaining] = await cb.expectASN1Sequence();
          while (authInfoAccessSeqRemaining() > 0) {
            const [endAuthInfoAccessInnerSeq] = await cb.expectASN1Sequence();
            const accessMethodOID = await cb.readASN1OID();
            await cb.expectUint8(contextSpecificType | 6, 0);
            const [endMethodURI, methodURIRemaining] = await cb.expectASN1Length(0);
            await cb.readUTF8String(methodURIRemaining());
            endMethodURI();
            endAuthInfoAccessInnerSeq();
          }
          endAuthInfoAccessSeq();
          endAuthInfoAccessDER();
        } else if (0) {
          const [endCertPolDER] = await cb.expectASN1DERDoc();
          const [endCertPolSeq, certPolSeqRemaining] = await cb.expectASN1Sequence();
          while (certPolSeqRemaining() > 0) {
            const [endCertPolInnerSeq, certPolInnerSeqRemaining] = await cb.expectASN1Sequence();
            const certPolOID = await cb.readASN1OID("CertPolicyID");
            while (certPolInnerSeqRemaining() > 0) {
              const [endCertPolInner2Seq, certPolInner2SeqRemaining] = await cb.expectASN1Sequence();
              while (certPolInner2SeqRemaining() > 0) {
                const [endCertPolInner3Seq, certPolInner3SeqRemaining] = await cb.expectASN1Sequence();
                const certPolQualOID = await cb.readASN1OID("policyQualifierId");
                const qualType = await cb.readUint8();
                if (0) {
                  cb.comment("IA5String");
                  const [endQualStr, qualStrRemaining] = await cb.expectASN1Length("string");
                  await cb.readUTF8String(qualStrRemaining());
                  endQualStr();
                } else {
                  if (certPolInner3SeqRemaining()) await cb.skipRead(certPolInner3SeqRemaining(), "skipped policy qualifier data");
                }
                endCertPolInner3Seq();
              }
              endCertPolInner2Seq();
            }
            endCertPolInnerSeq();
          }
          endCertPolSeq();
          endCertPolDER();
        } else {
          await cb.skipRead(extRemaining(), 0);
        }
        endExt();
      }
      endExts();
      endExtsData();
      endCertInfoSeq();
      cert.signedData = cb.data.subarray(tbsCertStartOffset, cb.offset);
      const [endSigAlgo, sigAlgoRemaining] = await cb.expectASN1Sequence(0);
      const sigAlgoOID = await cb.readASN1OID(0);
      if (sigAlgoRemaining() > 0) {
        await cb.expectASN1Null("no algorithm parameters");
      }
      endSigAlgo();
      if (sigAlgoOID !== cert.algorithm) throw new Error(`Certificate specifies different signature algorithms inside (${cert.algorithm}) and out (${sigAlgoOID})`);
      cert.signature = await cb.readASN1BitString(0);
      endCertSeq();
      cert.rawData = cb.data.subarray(certSeqStartOffset, cb.offset);
    } else {
      cert.serialNumber = u8FromHex(certData.serialNumber);
      cert.algorithm = certData.algorithm;
      cert.issuer = certData.issuer;
      cert.validityPeriod = {
        notBefore: new Date(certData.validityPeriod.notBefore),
        notAfter: new Date(certData.validityPeriod.notAfter)
      };
      cert.subject = certData.subject;
      cert.publicKey = {
        identifiers: certData.publicKey.identifiers,
        data: u8FromHex(certData.publicKey.data),
        all: u8FromHex(certData.publicKey.all)
      };
      cert.signature = u8FromHex(certData.signature);
      cert.keyUsage = {
        critical: certData.keyUsage.critical,
        usages: new Set(certData.keyUsage.usages)
      };
      cert.subjectAltNames = certData.subjectAltNames;
      cert.extKeyUsage = certData.extKeyUsage;
      if (certData.authorityKeyIdentifier) cert.authorityKeyIdentifier = u8FromHex(certData.authorityKeyIdentifier);
      if (certData.subjectKeyIdentifier) cert.subjectKeyIdentifier = u8FromHex(certData.subjectKeyIdentifier);
      cert.basicConstraints = certData.basicConstraints;
      cert.signedData = u8FromHex(certData.signedData);
      cert.rawData = u8FromHex(certData.rawData);
    }
    return cert;
  }
  subjectAltNameMatchingHost(host) {
    const twoDotRegex = /[.][^.]+[.][^.]+$/;
    return (this.subjectAltNames ?? []).find((cert) => {
      let certName = cert;
      let hostName = host;
      if (twoDotRegex.test(host) && twoDotRegex.test(certName) && certName.startsWith("*.")) {
        certName = certName.slice(1);
        hostName = hostName.slice(hostName.indexOf("."));
      }
      if (certName === hostName) return true;
    });
  }
  isValidAtMoment(moment = /* @__PURE__ */ new Date()) {
    return moment >= this.validityPeriod.notBefore && moment <= this.validityPeriod.notAfter;
  }
  description() {
    return "subject: " + _Cert.stringFromDistinguishedName(this.subject) + (this.subjectAltNames ? "\nsubject alt names: " + this.subjectAltNames.join(", ") : "") + (this.subjectKeyIdentifier ? `
subject key id: ${hexFromU8(this.subjectKeyIdentifier)}` : "") + "\nissuer: " + _Cert.stringFromDistinguishedName(
      this.issuer
    ) + (this.authorityKeyIdentifier ? `
authority key id: ${hexFromU8(this.authorityKeyIdentifier)}` : "") + "\nvalidity: " + this.validityPeriod.notBefore.toISOString() + " \u2014 " + this.validityPeriod.notAfter.toISOString() + ` (${this.isValidAtMoment() ? "currently valid" : "not valid"})` + (this.keyUsage ? `
key usage (${this.keyUsage.critical ? "critical" : "non-critical"}): ` + [...this.keyUsage.usages].join(", ") : "") + (this.extKeyUsage ? `
extended key usage: TLS server \u2014 ${this.extKeyUsage.serverTls}, TLS client \u2014 ${this.extKeyUsage.clientTls}` : "") + (this.basicConstraints ? `
basic constraints (${this.basicConstraints.critical ? "critical" : "non-critical"}): CA \u2014 ${this.basicConstraints.ca}, path length \u2014 ${this.basicConstraints.pathLength}` : "") + "\nsignature algorithm: " + descriptionForAlgorithm(
      algorithmWithOID(this.algorithm)
    );
  }
  toJSON() {
    return {
      serialNumber: hexFromU8(this.serialNumber),
      algorithm: this.algorithm,
      issuer: this.issuer,
      validityPeriod: {
        notBefore: this.validityPeriod.notBefore.toISOString(),
        notAfter: this.validityPeriod.notAfter.toISOString()
      },
      subject: this.subject,
      publicKey: {
        identifiers: this.publicKey.identifiers,
        data: hexFromU8(this.publicKey.data),
        all: hexFromU8(this.publicKey.all)
      },
      signature: hexFromU8(this.signature),
      keyUsage: {
        critical: this.keyUsage?.critical,
        usages: [...this.keyUsage?.usages ?? []]
      },
      subjectAltNames: this.subjectAltNames,
      extKeyUsage: this.extKeyUsage,
      authorityKeyIdentifier: this.authorityKeyIdentifier && hexFromU8(this.authorityKeyIdentifier),
      subjectKeyIdentifier: this.subjectKeyIdentifier && hexFromU8(this.subjectKeyIdentifier),
      basicConstraints: this.basicConstraints,
      signedData: hexFromU8(this.signedData),
      rawData: hexFromU8(this.rawData)
    };
  }
  static uint8ArraysFromPEM(pem) {
    const tag = "[A-Z0-9 ]+";
    const pattern = new RegExp(`-----BEGIN ${tag}-----([a-zA-Z0-9=+\\/\\n\\r]+)-----END ${tag}-----`, "g");
    const res = [];
    let matches = null;
    while (matches = pattern.exec(pem)) {
      const base64 = matches[1].replace(/[\r\n]/g, "");
      const binary = fromBase64(base64);
      res.push(binary);
    }
    return res;
  }
  static fromPEM(pem) {
    return Promise.all(this.uint8ArraysFromPEM(pem).map((arr) => this.create(arr)));
  }
};
var TrustedCert = class extends Cert {
  static {
    __name(this, "TrustedCert");
  }
  static async databaseFromPEM(pem) {
    const certsData = this.uint8ArraysFromPEM(pem);
    const offsets = [0];
    const subjects = {};
    const growable = new GrowableData();
    for (const certData of certsData) {
      const cert = await this.create(certData);
      const offsetIndex = offsets.length - 1;
      if (cert.subjectKeyIdentifier) subjects[hexFromU8(cert.subjectKeyIdentifier)] = offsetIndex;
      subjects[this.stringFromDistinguishedName(cert.subject)] = offsetIndex;
      growable.append(certData);
      offsets[offsets.length] = offsets[offsetIndex] + certData.length;
    }
    const data = growable.getData();
    return { index: { offsets, subjects }, data };
  }
  static async findInDatabase(subjectOrSubjectKeyId, db) {
    const { index: { subjects, offsets }, data } = db;
    const key = typeof subjectOrSubjectKeyId === "string" ? subjectOrSubjectKeyId : Cert.stringFromDistinguishedName(
      subjectOrSubjectKeyId
    );
    const offsetIndex = subjects[key];
    if (offsetIndex === void 0) return;
    const start = offsets[offsetIndex];
    const end = offsets[offsetIndex + 1];
    const certData = data.subarray(start, end);
    const cert = await this.create(certData);
    return cert;
  }
};
async function ecdsaVerify(sb, publicKey, signedData, namedCurve, hash) {
  const [endSigDer] = await sb.expectASN1Sequence();
  await sb.expectUint8(universalTypeInteger, 0);
  const [endSigRBytes, sigRBytesRemaining] = await sb.expectASN1Length(0);
  const sigR = await sb.readBytes(sigRBytesRemaining());
  endSigRBytes();
  await sb.expectUint8(universalTypeInteger, 0);
  const [endSigSBytes, sigSBytesRemaining] = await sb.expectASN1Length(0);
  const sigS = await sb.readBytes(sigSBytesRemaining());
  endSigSBytes();
  endSigDer();
  const clampToLength = /* @__PURE__ */ __name((x, clampLength) => x.length > clampLength ? x.subarray(x.length - clampLength) : (
    // too long? cut off leftmost bytes (msb)
    x.length < clampLength ? concat(new Uint8Array(clampLength - x.length), x) : (
      // too short? left pad with zeroes
      x
    )
  ), "clampToLength");
  const intLength = namedCurve === "P-256" ? 32 : 48;
  const signature = concat(clampToLength(sigR, intLength), clampToLength(sigS, intLength));
  const signatureKey = await cryptoProxy_default.importKey(
    "spki",
    publicKey,
    { name: "ECDSA", namedCurve },
    false,
    ["verify"]
  );
  const certVerifyResult = await cryptoProxy_default.verify({ name: "ECDSA", hash }, signatureKey, signature, signedData);
  if (certVerifyResult !== true) throw new Error("ECDSA certificate verify failed");
}
__name(ecdsaVerify, "ecdsaVerify");
async function verifyCerts(host, certs, rootCertsDatabase, requireServerTlsExtKeyUsage = true, requireDigitalSigKeyUsage = true) {
  for (const cert of certs) ;
  const userCert = certs[0];
  const matchingSubjectAltName = userCert.subjectAltNameMatchingHost(host);
  if (matchingSubjectAltName === void 0) throw new Error(`No matching subjectAltName for ${host}`);
  const validNow = userCert.isValidAtMoment();
  if (!validNow) throw new Error("End-user certificate is not valid now");
  if (requireServerTlsExtKeyUsage) {
    if (!userCert.extKeyUsage?.serverTls) throw new Error("End-user certificate has no TLS server extKeyUsage");
  }
  let verifiedToTrustedRoot = false;
  for (let i = 0, len = certs.length; i < len; i++) {
    const subjectCert = certs[i];
    const subjectAuthKeyId = subjectCert.authorityKeyIdentifier;
    let signingCert;
    if (subjectAuthKeyId === void 0) {
      signingCert = await TrustedCert.findInDatabase(subjectCert.issuer, rootCertsDatabase);
    } else {
      signingCert = await TrustedCert.findInDatabase(hexFromU8(subjectAuthKeyId), rootCertsDatabase);
    }
    if (signingCert !== void 0) {
    }
    if (signingCert === void 0) signingCert = certs[i + 1];
    if (signingCert === void 0) throw new Error("Ran out of certificates without reaching a trusted root");
    const signingCertIsTrustedRoot = signingCert instanceof TrustedCert;
    if (signingCert.isValidAtMoment() !== true) throw new Error("Signing certificate is not valid now");
    if (requireDigitalSigKeyUsage) {
      if (signingCert.keyUsage?.usages.has("digitalSignature") !== true) throw new Error("Signing certificate keyUsage does not include digital signatures");
    }
    if (signingCert.basicConstraints?.ca !== true) throw new Error("Signing certificate basicConstraints do not indicate a CA certificate");
    const { pathLength } = signingCert.basicConstraints;
    if (pathLength === void 0) {
    } else {
      if (pathLength < i) throw new Error("Exceeded certificate pathLength");
    }
    if (subjectCert.algorithm === "1.2.840.10045.4.3.2" || subjectCert.algorithm === "1.2.840.10045.4.3.3") {
      const hash = subjectCert.algorithm === "1.2.840.10045.4.3.2" ? "SHA-256" : "SHA-384";
      const signingKeyOIDs = signingCert.publicKey.identifiers;
      const namedCurve = signingKeyOIDs.includes("1.2.840.10045.3.1.7") ? "P-256" : signingKeyOIDs.includes("1.3.132.0.34") ? "P-384" : void 0;
      if (namedCurve === void 0) throw new Error("Unsupported signing key curve");
      const sb = new ASN1Bytes(subjectCert.signature);
      await ecdsaVerify(sb, signingCert.publicKey.all, subjectCert.signedData, namedCurve, hash);
    } else if (subjectCert.algorithm === "1.2.840.113549.1.1.11" || subjectCert.algorithm === "1.2.840.113549.1.1.12") {
      const hash = subjectCert.algorithm === "1.2.840.113549.1.1.11" ? "SHA-256" : "SHA-384";
      const signatureKey = await cryptoProxy_default.importKey("spki", signingCert.publicKey.all, { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
      const certVerifyResult = await cryptoProxy_default.verify({ name: "RSASSA-PKCS1-v1_5" }, signatureKey, subjectCert.signature, subjectCert.signedData);
      if (certVerifyResult !== true) throw new Error("RSASSA_PKCS1-v1_5-SHA256 certificate verify failed");
    } else {
      throw new Error("Unsupported signing algorithm");
    }
    if (signingCertIsTrustedRoot) {
      verifiedToTrustedRoot = true;
      break;
    }
  }
  return verifiedToTrustedRoot;
}
__name(verifyCerts, "verifyCerts");
var txtEnc3 = new TextEncoder();
async function readEncryptedHandshake(host, hs, serverSecret, hellos, rootCertsDatabase, requireServerTlsExtKeyUsage = true, requireDigitalSigKeyUsage = true) {
  await hs.expectUint8(8, 0);
  const [eeMessageEnd] = await hs.expectLengthUint24();
  const [extEnd, extRemaining] = await hs.expectLengthUint16(0);
  while (extRemaining() > 0) {
    const extType = await hs.readUint16(0);
    if (extType === 0) {
      await hs.expectUint16(0, 0);
    } else if (extType === 10) {
      const [endGroupsData] = await hs.expectLengthUint16(0);
      const [endGroups, groupsRemaining] = await hs.expectLengthUint16(0);
      while (groupsRemaining() > 0) {
        const group = await hs.readUint16();
        if (0) {
          const groupName = {
            23: "secp256r1",
            24: "secp384r1",
            25: "secp521r1",
            29: "x25519",
            30: "x448",
            256: "ffdhe2048",
            257: "ffdhe3072",
            258: "ffdhe4096",
            259: "ffdhe6144",
            260: "ffdhe8192"
          }[group] ?? "unrecognised group";
          hs.comment(`group: ${groupName}`);
        }
      }
      endGroups();
      endGroupsData();
    } else {
      throw new Error(`Unsupported server encrypted extension type 0x${hexFromU8([extType]).padStart(4, "0")}`);
    }
  }
  extEnd();
  eeMessageEnd();
  let clientCertRequested = false;
  let certMsgType = await hs.readUint8();
  if (certMsgType === 13) {
    clientCertRequested = true;
    const [endCertReq] = await hs.expectLengthUint24("certificate request data");
    await hs.expectUint8(0, 0);
    const [endCertReqExts, certReqExtsRemaining] = await hs.expectLengthUint16("certificate request extensions");
    await hs.skipRead(certReqExtsRemaining(), 0);
    endCertReqExts();
    endCertReq();
    certMsgType = await hs.readUint8();
  }
  if (certMsgType !== 11) throw new Error(`Unexpected handshake message type 0x${hexFromU8([certMsgType])}`);
  const [endCertPayload] = await hs.expectLengthUint24(0);
  await hs.expectUint8(0, 0);
  const [endCerts, certsRemaining] = await hs.expectLengthUint24(0);
  const certs = [];
  while (certsRemaining() > 0) {
    const [endCert] = await hs.expectLengthUint24(0);
    const cert = await Cert.create(hs);
    certs.push(cert);
    endCert();
    const [endCertExt, certExtRemaining] = await hs.expectLengthUint16(0);
    await hs.skipRead(certExtRemaining());
    endCertExt();
  }
  endCerts();
  endCertPayload();
  if (certs.length === 0) throw new Error("No certificates supplied");
  const userCert = certs[0];
  const certVerifyHandshakeData = hs.data.subarray(0, hs.offset);
  const certVerifyData = concat(hellos, certVerifyHandshakeData);
  const certVerifyHashBuffer = await cryptoProxy_default.digest("SHA-256", certVerifyData);
  const certVerifyHash = new Uint8Array(certVerifyHashBuffer);
  const certVerifySignedData = concat(
    txtEnc3.encode(" ".repeat(64) + "TLS 1.3, server CertificateVerify"),
    [0],
    certVerifyHash
  );
  await hs.expectUint8(15, 0);
  const [endCertVerifyPayload] = await hs.expectLengthUint24(0);
  const sigType = await hs.readUint16();
  if (sigType === 1027) {
    const [endSignature] = await hs.expectLengthUint16();
    await ecdsaVerify(hs, userCert.publicKey.all, certVerifySignedData, "P-256", "SHA-256");
    endSignature();
  } else if (sigType === 2052) {
    const [endSignature, signatureRemaining] = await hs.expectLengthUint16();
    const signature = await hs.subarrayForRead(signatureRemaining());
    endSignature();
    const signatureKey = await cryptoProxy_default.importKey("spki", userCert.publicKey.all, {
      name: "RSA-PSS",
      hash: "SHA-256"
    }, false, ["verify"]);
    const certVerifyResult = await cryptoProxy_default.verify({
      name: "RSA-PSS",
      saltLength: 32
      /* SHA-256 length in bytes */
    }, signatureKey, signature, certVerifySignedData);
    if (certVerifyResult !== true) throw new Error("RSA-PSS-RSAE-SHA256 certificate verify failed");
  } else {
    throw new Error(`Unsupported certificate verify signature type 0x${hexFromU8([sigType]).padStart(4, "0")}`);
  }
  endCertVerifyPayload();
  const verifyHandshakeData = hs.data.subarray(0, hs.offset);
  const verifyData = concat(hellos, verifyHandshakeData);
  const finishedKey = await hkdfExpandLabel(serverSecret, "finished", new Uint8Array(0), 32, 256);
  const finishedHash = await cryptoProxy_default.digest("SHA-256", verifyData);
  const hmacKey = await cryptoProxy_default.importKey("raw", finishedKey, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
  const correctVerifyHashBuffer = await cryptoProxy_default.sign("HMAC", hmacKey, finishedHash);
  const correctVerifyHash = new Uint8Array(correctVerifyHashBuffer);
  await hs.expectUint8(20, 0);
  const [endHsFinishedPayload, hsFinishedPayloadRemaining] = await hs.expectLengthUint24(0);
  const verifyHash = await hs.readBytes(hsFinishedPayloadRemaining());
  endHsFinishedPayload();
  if (hs.readRemaining() !== 0) throw new Error("Unexpected extra bytes in server handshake");
  const verifyHashVerified = equal(verifyHash, correctVerifyHash);
  if (verifyHashVerified !== true) throw new Error("Invalid server verify hash");
  const verifiedToTrustedRoot = await verifyCerts(
    host,
    certs,
    rootCertsDatabase,
    requireServerTlsExtKeyUsage,
    requireDigitalSigKeyUsage
  );
  if (!verifiedToTrustedRoot) throw new Error("Validated certificate chain did not end in a trusted root");
  return { handshakeData: hs.data.subarray(0, hs.offset), clientCertRequested, userCert };
}
__name(readEncryptedHandshake, "readEncryptedHandshake");
async function startTls(host, rootCertsDatabase, networkRead, networkWrite, {
  useSNI,
  requireServerTlsExtKeyUsage,
  requireDigitalSigKeyUsage,
  writePreData,
  expectPreData,
  commentPreData
} = {}) {
  useSNI ?? (useSNI = true);
  requireServerTlsExtKeyUsage ?? (requireServerTlsExtKeyUsage = true);
  requireDigitalSigKeyUsage ?? (requireDigitalSigKeyUsage = true);
  if (typeof rootCertsDatabase === "string") rootCertsDatabase = await TrustedCert.databaseFromPEM(rootCertsDatabase);
  const ecdhKeys = await cryptoProxy_default.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const rawPublicKeyBuffer = await cryptoProxy_default.exportKey("raw", ecdhKeys.publicKey);
  const rawPublicKey = new Uint8Array(rawPublicKeyBuffer);
  if (0) {
    const privateKeyJWK = await cryptoProxy_default.exportKey("jwk", ecdhKeys.privateKey);
    log7("We begin the TLS connection by generating an [ECDH](https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman) key pair using curve [P-256](https://neuromancer.sk/std/nist/P-256). The private key, d, is simply a 256-bit integer picked at random:");
    log7(...highlightColonList3("d: " + hexFromU84(fromBase642(privateKeyJWK.d, { alphabet: "base64url" }))));
    log7("The public key is a point on the curve. The point is [derived from d and a base point](https://curves.xargs.org). It\u2019s identified by coordinates x and y.");
    log7(...highlightColonList3("x: " + hexFromU84(fromBase642(privateKeyJWK.x, { alphabet: "base64url" }))));
    log7(...highlightColonList3("y: " + hexFromU84(fromBase642(privateKeyJWK.y, { alphabet: "base64url" }))));
  }
  const sessionId = new Uint8Array(32);
  await getRandomValues(sessionId);
  const clientHello = await makeClientHello(host, rawPublicKey, sessionId, useSNI);
  const clientHelloData = clientHello.array();
  const initialData = writePreData ? concat(writePreData, clientHelloData) : clientHelloData;
  networkWrite(initialData);
  if (expectPreData) {
    const receivedPreData = await networkRead(expectPreData.length);
    if (!receivedPreData || !equal(receivedPreData, expectPreData)) throw new Error("Pre data did not match expectation");
  }
  const serverHello = bytesFromTlsRecords(
    networkRead,
    22
    /* Handshake */
  );
  const serverPublicKey = await parseServerHello(serverHello, sessionId);
  const ccipher = bytesFromTlsRecords(
    networkRead,
    20
    /* ChangeCipherSpec */
  );
  await ccipher.expectUint8(1, 0);
  const clientHelloContent = clientHelloData.subarray(5);
  const serverHelloContent = serverHello.array();
  const hellos = concat(clientHelloContent, serverHelloContent);
  const handshakeKeys = await getHandshakeKeys(serverPublicKey, ecdhKeys.privateKey, hellos, 256, 16);
  const serverHandshakeKey = await cryptoProxy_default.importKey("raw", handshakeKeys.serverHandshakeKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const handshakeDecrypter = new Crypter("decrypt", serverHandshakeKey, handshakeKeys.serverHandshakeIV);
  const clientHandshakeKey = await cryptoProxy_default.importKey("raw", handshakeKeys.clientHandshakeKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const handshakeEncrypter = new Crypter("encrypt", clientHandshakeKey, handshakeKeys.clientHandshakeIV);
  const handshakeBytes = bytesFromEncryptedTlsRecords(
    networkRead,
    handshakeDecrypter,
    22
    /* Handshake */
  );
  const { handshakeData: serverHandshake, clientCertRequested, userCert } = await readEncryptedHandshake(
    host,
    handshakeBytes,
    handshakeKeys.serverSecret,
    hellos,
    rootCertsDatabase,
    requireServerTlsExtKeyUsage,
    requireDigitalSigKeyUsage
  );
  const clientCipherChange = new Bytes(6);
  clientCipherChange.writeUint8(20, 0);
  clientCipherChange.writeUint16(771, 0);
  const endClientCipherChangePayload = clientCipherChange.writeLengthUint16();
  clientCipherChange.writeUint8(1, 0);
  endClientCipherChangePayload();
  const clientCipherChangeData = clientCipherChange.array();
  let clientCertRecordData = new Uint8Array(0);
  if (clientCertRequested) {
    const clientCertRecord = new Bytes(8);
    clientCertRecord.writeUint8(11, 0);
    const endClientCerts = clientCertRecord.writeLengthUint24("client certificate data");
    clientCertRecord.writeUint8(0, 0);
    clientCertRecord.writeUint24(0, 0);
    endClientCerts();
    clientCertRecordData = clientCertRecord.array();
  }
  const wholeHandshake = concat(hellos, serverHandshake, clientCertRecordData);
  const wholeHandshakeHashBuffer = await cryptoProxy_default.digest("SHA-256", wholeHandshake);
  const wholeHandshakeHash = new Uint8Array(wholeHandshakeHashBuffer);
  const finishedKey = await hkdfExpandLabel(handshakeKeys.clientSecret, "finished", new Uint8Array(0), 32, 256);
  const verifyHmacKey = await cryptoProxy_default.importKey("raw", finishedKey, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
  const verifyDataBuffer = await cryptoProxy_default.sign("HMAC", verifyHmacKey, wholeHandshakeHash);
  const verifyData = new Uint8Array(verifyDataBuffer);
  const clientFinishedRecord = new Bytes(36);
  clientFinishedRecord.writeUint8(20, 0);
  const clientFinishedRecordEnd = clientFinishedRecord.writeLengthUint24(0);
  clientFinishedRecord.writeBytes(verifyData);
  clientFinishedRecordEnd();
  const clientFinishedRecordData = clientFinishedRecord.array();
  const encryptedClientFinished = await makeEncryptedTlsRecords(
    concat(clientCertRecordData, clientFinishedRecordData),
    handshakeEncrypter,
    22
    /* Handshake */
  );
  let partialHandshakeHash = wholeHandshakeHash;
  if (clientCertRecordData.length > 0) {
    const partialHandshake = wholeHandshake.subarray(0, wholeHandshake.length - clientCertRecordData.length);
    const partialHandshakeHashBuffer = await cryptoProxy_default.digest("SHA-256", partialHandshake);
    partialHandshakeHash = new Uint8Array(partialHandshakeHashBuffer);
  }
  const applicationKeys = await getApplicationKeys(handshakeKeys.handshakeSecret, partialHandshakeHash, 256, 16);
  const clientApplicationKey = await cryptoProxy_default.importKey(
    "raw",
    applicationKeys.clientApplicationKey,
    { name: "AES-GCM" },
    true,
    ["encrypt"]
  );
  const applicationEncrypter = new Crypter("encrypt", clientApplicationKey, applicationKeys.clientApplicationIV);
  const serverApplicationKey = await cryptoProxy_default.importKey(
    "raw",
    applicationKeys.serverApplicationKey,
    { name: "AES-GCM" },
    true,
    ["decrypt"]
  );
  const applicationDecrypter = new Crypter("decrypt", serverApplicationKey, applicationKeys.serverApplicationIV);
  let wroteFinishedRecords = false;
  const read = /* @__PURE__ */ __name(() => {
    if (!wroteFinishedRecords) {
      const finishedRecords = concat(clientCipherChangeData, ...encryptedClientFinished);
      networkWrite(finishedRecords);
      wroteFinishedRecords = true;
    }
    return readEncryptedTlsRecord(networkRead, applicationDecrypter);
  }, "read");
  const write = /* @__PURE__ */ __name(async (data) => {
    const localWroteFinishedRecords = wroteFinishedRecords;
    wroteFinishedRecords = true;
    const encryptedRecords = await makeEncryptedTlsRecords(
      data,
      applicationEncrypter,
      23
      /* Application */
    );
    const allRecords = localWroteFinishedRecords ? concat(...encryptedRecords) : concat(
      clientCipherChangeData,
      ...encryptedClientFinished,
      ...encryptedRecords
    );
    networkWrite(allRecords);
  }, "write");
  return { read, write, userCert };
}
__name(startTls, "startTls");

// src/root-certs.ts
var ROOT_CERTS_PEM = `
# GTS_Root_R1.pem
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
# GTS_Root_R3.pem
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPluILrIPglJ209ZjAKBggqhkjOPQQDAzBHMQswCQYD
VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG
A1UEAxMLR1RTIFJvb3QgUjMwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw
WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz
IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjMwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AAQfTzOHMymKoYTey8chWEGJ6ladK0uFxh1MJ7x/JlFyb+Kf1qPKzEUURout736G
jOyxfi//qXGdGIRFBEFVbivqJn+7kAHjSxm65FSWRQmx1WyRRK2EE46ajA2ADDL2
4CejQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW
BBTB8Sa6oC2uhYHP0/EqEr24Cmf9vDAKBggqhkjOPQQDAwNpADBmAjEA9uEglRR7
VKOQFhG/hMjqb2sXnh5GmCCbn9MN2azTL818+FsuVbu/3ZL3pAzcMeGiAjEA/Jdm
ZuVDFhOD3cffL74UOO0BzrEXGhF16b0DjyZ+hOXJYKaV11RZt+cRLInUue4X
-----END CERTIFICATE-----
# GTS_Root_R4.pem
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPlwGjvYxqccpBQUjAKBggqhkjOPQQDAzBHMQswCQYD
VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG
A1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw
WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz
IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzuhXyi
QHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/lxKvR
HYqjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW
BBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNpADBmAjEA6ED/g94D
9J+uHXqnLrmvT/aDHQ4thQEd0dlq7A/Cr8deVl5c1RxYIigL9zC2L7F8AjEA8GE8
p/SgguMh1YQdc4acLa/KNJvxn7kjNuK8YAOdgLOaVsjh4rsUecrNIdSUtUlD
-----END CERTIFICATE-----
# GlobalSign_Root_CA_-_R3.pem
-----BEGIN CERTIFICATE-----
MIIDXzCCAkegAwIBAgILBAAAAAABIVhTCKIwDQYJKoZIhvcNAQELBQAwTDEgMB4G
A1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjMxEzARBgNVBAoTCkdsb2JhbFNp
Z24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMDkwMzE4MTAwMDAwWhcNMjkwMzE4
MTAwMDAwWjBMMSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEG
A1UEChMKR2xvYmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjCCASIwDQYJKoZI
hvcNAQEBBQADggEPADCCAQoCggEBAMwldpB5BngiFvXAg7aEyiie/QV2EcWtiHL8
RgJDx7KKnQRfJMsuS+FggkbhUqsMgUdwbN1k0ev1LKMPgj0MK66X17YUhhB5uzsT
gHeMCOFJ0mpiLx9e+pZo34knlTifBtc+ycsmWQ1z3rDI6SYOgxXG71uL0gRgykmm
KPZpO/bLyCiR5Z2KYVc3rHQU3HTgOu5yLy6c+9C7v/U9AOEGM+iCK65TpjoWc4zd
QQ4gOsC0p6Hpsk+QLjJg6VfLuQSSaGjlOCZgdbKfd/+RFO+uIEn8rUAVSNECMWEZ
XriX7613t2Saer9fwRPvm2L7DWzgVGkWqQPabumDk3F2xmmFghcCAwEAAaNCMEAw
DgYDVR0PAQH/BAQDAgEGMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFI/wS3+o
LkUkrk1Q+mOai97i3Ru8MA0GCSqGSIb3DQEBCwUAA4IBAQBLQNvAUKr+yAzv95ZU
RUm7lgAJQayzE4aGKAczymvmdLm6AC2upArT9fHxD4q/c2dKg8dEe3jgr25sbwMp
jjM5RcOO5LlXbKr8EpbsU8Yt5CRsuZRj+9xTaGdWPoO4zzUhw8lo/s7awlOqzJCK
6fBdRoyV3XpYKBovHd7NADdBj+1EbddTKJd+82cEHhXXipa0095MJ6RMG3NzdvQX
mcIfeg7jLQitChws/zyrVQ4PkX4268NXSb7hLi18YIvDQVETI53O9zJrlAGomecs
Mx86OyXShkDOOyyGeMlhLxS67ttVb9+E7gUJTb0o2HLO02JQZR7rkpeDMdmztcpH
WD9f
-----END CERTIFICATE-----
# GlobalSign_Root_E46.pem
-----BEGIN CERTIFICATE-----
MIICCzCCAZGgAwIBAgISEdK7ujNu1LzmJGjFDYQdmOhDMAoGCCqGSM49BAMDMEYx
CzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52LXNhMRwwGgYDVQQD
ExNHbG9iYWxTaWduIFJvb3QgRTQ2MB4XDTE5MDMyMDAwMDAwMFoXDTQ2MDMyMDAw
MDAwMFowRjELMAkGA1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2Ex
HDAaBgNVBAMTE0dsb2JhbFNpZ24gUm9vdCBFNDYwdjAQBgcqhkjOPQIBBgUrgQQA
IgNiAAScDrHPt+ieUnd1NPqlRqetMhkytAepJ8qUuwzSChDH2omwlwxwEwkBjtjq
R+q+soArzfwoDdusvKSGN+1wCAB16pMLey5SnCNoIwZD7JIvU4Tb+0cUB+hflGdd
yXqBPCCjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1Ud
DgQWBBQxCpCPtsad0kRLgLWi5h+xEk8blTAKBggqhkjOPQQDAwNoADBlAjEA31SQ
7Zvvi5QCkxeCmb6zniz2C5GMn0oUsfZkvLtoURMMA/cVi4RguYv/Uo7njLwcAjA8
+RHUjE7AwWHCFUyqqx0LMV87HOIAl0Qx5v5zli/altP+CAezNIm8BZ/3Hobui3A=
-----END CERTIFICATE-----
# GlobalSign_Root_R46.pem
-----BEGIN CERTIFICATE-----
MIIFWjCCA0KgAwIBAgISEdK7udcjGJ5AXwqdLdDfJWfRMA0GCSqGSIb3DQEBDAUA
MEYxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52LXNhMRwwGgYD
VQQDExNHbG9iYWxTaWduIFJvb3QgUjQ2MB4XDTE5MDMyMDAwMDAwMFoXDTQ2MDMy
MDAwMDAwMFowRjELMAkGA1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYt
c2ExHDAaBgNVBAMTE0dsb2JhbFNpZ24gUm9vdCBSNDYwggIiMA0GCSqGSIb3DQEB
AQUAA4ICDwAwggIKAoICAQCsrHQy6LNl5brtQyYdpokNRbopiLKkHWPd08EsCVeJ
OaFV6Wc0dwxu5FUdUiXSE2te4R2pt32JMl8Nnp8semNgQB+msLZ4j5lUlghYruQG
vGIFAha/r6gjA7aUD7xubMLL1aa7DOn2wQL7Id5m3RerdELv8HQvJfTqa1VbkNud
316HCkD7rRlr+/fKYIje2sGP1q7Vf9Q8g+7XFkyDRTNrJ9CG0Bwta/OrffGFqfUo
0q3v84RLHIf8E6M6cqJaESvWJ3En7YEtbWaBkoe0G1h6zD8K+kZPTXhc+CtI4wSE
y132tGqzZfxCnlEmIyDLPRT5ge1lFgBPGmSXZgjPjHvjK8Cd+RTyG/FWaha/LIWF
zXg4mutCagI0GIMXTpRW+LaCtfOW3T3zvn8gdz57GSNrLNRyc0NXfeD412lPFzYE
+cCQYDdF3uYM2HSNrpyibXRdQr4G9dlkbgIQrImwTDsHTUB+JMWKmIJ5jqSngiCN
I/onccnfxkF0oE32kRbcRoxfKWMxWXEM2G/CtjJ9++ZdU6Z+Ffy7dXxd7Pj2Fxzs
x2sZy/N78CsHpdlseVR2bJ0cpm4O6XkMqCNqo98bMDGfsVR7/mrLZqrcZdCinkqa
ByFrgY/bxFn63iLABJzjqls2k+g9vXqhnQt2sQvHnf3PmKgGwvgqo6GDoLclcqUC
4wIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNV
HQ4EFgQUA1yrc4GHqMywptWU4jaWSf8FmSwwDQYJKoZIhvcNAQEMBQADggIBAHx4
7PYCLLtbfpIrXTncvtgdokIzTfnvpCo7RGkerNlFo048p9gkUbJUHJNOxO97k4Vg
JuoJSOD1u8fpaNK7ajFxzHmuEajwmf3lH7wvqMxX63bEIaZHU1VNaL8FpO7XJqti
2kM3S+LGteWygxk6x9PbTZ4IevPuzz5i+6zoYMzRx6Fcg0XERczzF2sUyQQCPtIk
pnnpHs6i58FZFZ8d4kuaPp92CC1r2LpXFNqD6v6MVenQTqnMdzGxRBF6XLE+0xRF
FRhiJBPSy03OXIPBNvIQtQ6IbbjhVp+J3pZmOUdkLG5NrmJ7v2B0GbhWrJKsFjLt
rWhV/pi60zTe9Mlhww6G9kuEYO4Ne7UyWHmRVSyBQ7N0H3qqJZ4d16GLuc1CLgSk
ZoNNiTW2bKg2SnkheCLQQrzRQDGQob4Ez8pn7fXwgNNgyYMqIgXQBztSvwyeqiv5
u+YfjyW6hY0XHgL+XVAEV8/+LbzvXMAaq7afJMbfc2hIkCwU9D9SGuTSyxTDYWnP
4vkYxboznxSjBF25cfe1lNj2M8FawTSLfJvdkzrnE6JwYZ+vj+vYxXX4M2bUdGc6
N3ec592kD3ZDZopD8p/7DEJ4Y9HiD2971KE9dJeFt0g5QdYg/NA6s/rob8SKunE3
vouXsXgxT7PntgMTzlSdriVZzH81Xwj3QEUxeCp6
-----END CERTIFICATE-----
# ISRG_Root_X1.pem
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
# ISRG_Root_X2.pem
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----
# DigiCert_Global_Root_G2.pem
-----BEGIN CERTIFICATE-----
MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI
2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx
1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ
q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz
tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ
vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV
5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY
1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4
NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG
Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91
8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe
pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl
MrY=
-----END CERTIFICATE-----
# DigiCert_Global_Root_G3.pem
-----BEGIN CERTIFICATE-----
MIICPzCCAcWgAwIBAgIQBVVWvPJepDU1w6QP1atFcjAKBggqhkjOPQQDAzBhMQsw
CQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3d3cu
ZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBHMzAe
Fw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVTMRUw
EwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5jb20x
IDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEczMHYwEAYHKoZIzj0CAQYF
K4EEACIDYgAE3afZu4q4C/sLfyHS8L6+c/MzXRq8NOrexpu80JX28MzQC7phW1FG
fp4tn+6OYwwX7Adw9c+ELkCDnOg/QW07rdOkFFk2eJ0DQ+4QE2xy3q6Ip6FrtUPO
Z9wj/wMco+I+o0IwQDAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAd
BgNVHQ4EFgQUs9tIpPmhxdiuNkHMEWNpYim8S8YwCgYIKoZIzj0EAwMDaAAwZQIx
AK288mw/EkrRLTnDCgmXc/SINoyIJ7vmiI1Qhadj+Z4y3maTD/HMsQmP3Wyr+mt/
oAIwOWZbwmSNuJ5Q3KjVSaLtx9zRSX8XAbjIho9OjIgrqJqpisXRAL34VOKa5Vt8
sycX
-----END CERTIFICATE-----
`;

// src/socks5-fetch.ts
var encoder2 = new TextEncoder();
var decoder2 = new TextDecoder();
var cachedRootCertsDbPromise = null;
function getRootCertsDb() {
  if (!cachedRootCertsDbPromise) {
    cachedRootCertsDbPromise = TrustedCert.databaseFromPEM(ROOT_CERTS_PEM);
  }
  return cachedRootCertsDbPromise;
}
__name(getRootCertsDb, "getRootCertsDb");
var BufferedReader = class {
  static {
    __name(this, "BufferedReader");
  }
  nextChunkFn;
  buf = new Uint8Array(0);
  constructor(nextChunkFn) {
    this.nextChunkFn = nextChunkFn;
  }
  append(chunk) {
    if (this.buf.length === 0) {
      this.buf = chunk;
      return;
    }
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
  }
  async readExact(n) {
    while (this.buf.length < n) {
      const chunk = await this.nextChunkFn();
      if (chunk === null) {
        throw new Error(`Unexpected EOF while reading ${n} bytes (got ${this.buf.length})`);
      }
      if (chunk.length > 0) {
        this.append(chunk);
      }
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }
  async readUntil(delimiter, maxBytes = 65536) {
    while (true) {
      const idx = indexOfBytes(this.buf, delimiter);
      if (idx !== -1) {
        const out = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + delimiter.length);
        return out;
      }
      if (this.buf.length > maxBytes) {
        throw new Error(`Exceeded ${maxBytes} bytes searching for header delimiter`);
      }
      const chunk = await this.nextChunkFn();
      if (chunk === null) {
        throw new Error("Unexpected EOF before HTTP response headers completed");
      }
      if (chunk.length > 0) {
        this.append(chunk);
      }
    }
  }
  async readNextChunk() {
    if (this.buf.length > 0) {
      const out = this.buf;
      this.buf = new Uint8Array(0);
      return out;
    }
    return this.nextChunkFn();
  }
};
function indexOfBytes(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
__name(indexOfBytes, "indexOfBytes");
async function performSocks5Handshake(br, writer, targetHost, targetPort, username, password) {
  const hasAuth = username.length > 0 || password.length > 0;
  await writer.write(
    hasAuth ? new Uint8Array([5, 2, 0, 2]) : new Uint8Array([5, 1, 0])
  );
  const greetResp = await br.readExact(2);
  if (greetResp[0] !== 5) {
    throw new Error(`SOCKS5 invalid version: ${greetResp[0]}`);
  }
  const method = greetResp[1];
  if (method === 255) {
    throw new Error("SOCKS5 proxy rejected all authentication methods");
  }
  if (method === 2) {
    const uBytes = encoder2.encode(username);
    const pBytes = encoder2.encode(password);
    if (uBytes.length > 255 || pBytes.length > 255) {
      throw new Error("SOCKS5 username/password exceeds 255 bytes");
    }
    const authReq = new Uint8Array(3 + uBytes.length + pBytes.length);
    authReq[0] = 1;
    authReq[1] = uBytes.length;
    authReq.set(uBytes, 2);
    authReq[2 + uBytes.length] = pBytes.length;
    authReq.set(pBytes, 3 + uBytes.length);
    await writer.write(authReq);
    const authResp = await br.readExact(2);
    if (authResp[1] !== 0) {
      throw new Error(`SOCKS5 authentication failed (status=${authResp[1]})`);
    }
  } else if (method !== 0) {
    throw new Error(`SOCKS5 unsupported auth method: ${method}`);
  }
  const hostBytes = encoder2.encode(targetHost);
  if (hostBytes.length > 255) {
    throw new Error("Target hostname exceeds 255 bytes");
  }
  const req = new Uint8Array(7 + hostBytes.length);
  req[0] = 5;
  req[1] = 1;
  req[2] = 0;
  req[3] = 3;
  req[4] = hostBytes.length;
  req.set(hostBytes, 5);
  req[5 + hostBytes.length] = targetPort >> 8 & 255;
  req[6 + hostBytes.length] = targetPort & 255;
  await writer.write(req);
  const replyHead = await br.readExact(4);
  if (replyHead[0] !== 5 || replyHead[1] !== 0) {
    throw new Error(`SOCKS5 CONNECT failed (ver=${replyHead[0]}, rep=${replyHead[1]})`);
  }
  const atyp = replyHead[3];
  if (atyp === 1) {
    await br.readExact(6);
  } else if (atyp === 4) {
    await br.readExact(18);
  } else if (atyp === 3) {
    const lenByte = await br.readExact(1);
    await br.readExact(lenByte[0] + 2);
  } else {
    throw new Error(`SOCKS5 unknown reply ATYP: ${atyp}`);
  }
}
__name(performSocks5Handshake, "performSocks5Handshake");
async function performHttpConnectHandshake(br, writer, targetHost, targetPort, username, password) {
  const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
  const lines = [
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
    `Host: ${targetHost}:${targetPort}`
  ];
  if (username || password) {
    lines.push(`Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}`);
  }
  lines.push("", "");
  await writer.write(encoder2.encode(lines.join("\r\n")));
  const headerBytes = await br.readUntil(CRLFCRLF);
  const statusLine = decoder2.decode(headerBytes).split("\r\n")[0] ?? "";
  if (!/^HTTP\/1\.[01]\s+200\b/.test(statusLine)) {
    throw new Error(`HTTP CONNECT proxy failed: ${statusLine}`);
  }
}
__name(performHttpConnectHandshake, "performHttpConnectHandshake");
function createChunkedBodyStream(br, closeSocket) {
  const CRLF = new Uint8Array([13, 10]);
  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const sizeLineBytes = await br.readUntil(CRLF, 1024);
          const sizeLine = decoder2.decode(sizeLineBytes).split(";")[0].trim();
          if (!sizeLine) continue;
          const chunkSize = parseInt(sizeLine, 16);
          if (!Number.isFinite(chunkSize) || chunkSize < 0) {
            throw new Error(`Invalid HTTP chunk size: ${sizeLine}`);
          }
          if (chunkSize === 0) {
            controller.close();
            closeSocket();
            return;
          }
          const data = await br.readExact(chunkSize);
          await br.readExact(2);
          if (data.length > 0) {
            controller.enqueue(data);
            return;
          }
        }
      } catch (err) {
        closeSocket();
        controller.error(err);
      }
    },
    cancel() {
      closeSocket();
    }
  });
}
__name(createChunkedBodyStream, "createChunkedBodyStream");
function createRawBodyStream(br, contentLength, closeSocket) {
  let remaining = contentLength;
  return new ReadableStream({
    async pull(controller) {
      try {
        if (remaining !== null && remaining <= 0) {
          controller.close();
          closeSocket();
          return;
        }
        const chunk = await br.readNextChunk();
        if (chunk === null) {
          controller.close();
          closeSocket();
          return;
        }
        if (remaining !== null && chunk.length > remaining) {
          controller.enqueue(chunk.slice(0, remaining));
          remaining = 0;
          controller.close();
          closeSocket();
          return;
        }
        if (remaining !== null) {
          remaining -= chunk.length;
        }
        if (chunk.length > 0) {
          controller.enqueue(chunk);
        }
      } catch (err) {
        closeSocket();
        controller.error(err);
      }
    },
    cancel() {
      closeSocket();
    }
  });
}
__name(createRawBodyStream, "createRawBodyStream");
async function defaultConnector(address, options) {
  const mod = await import("cloudflare:sockets");
  return mod.connect(address, options);
}
__name(defaultConnector, "defaultConnector");
async function fetchViaProxy(proxyUrlRaw, input, init = {}, connector) {
  const proxyUrl = new URL(proxyUrlRaw);
  const proxyScheme = proxyUrl.protocol.replace(/:$/, "").toLowerCase();
  const proxyHost = proxyUrl.hostname;
  const proxyPort = proxyUrl.port ? Number(proxyUrl.port) : proxyScheme.startsWith("socks") ? 1080 : 8080;
  const proxyUser = decodeURIComponent(proxyUrl.username);
  const proxyPass = decodeURIComponent(proxyUrl.password);
  const targetUrl = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
  const isHttps = targetUrl.protocol === "https:";
  const targetHost = targetUrl.hostname;
  const targetPort = targetUrl.port ? Number(targetUrl.port) : isHttps ? 443 : 80;
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const pathAndQuery = `${targetUrl.pathname || "/"}${targetUrl.search}`;
  const rawSocket = connector ? connector(
    { hostname: proxyHost, port: proxyPort },
    { secureTransport: "off", allowHalfOpen: false }
  ) : await defaultConnector(
    { hostname: proxyHost, port: proxyPort },
    { secureTransport: "off", allowHalfOpen: false }
  );
  const onAbort = /* @__PURE__ */ __name(() => {
    void rawSocket.close().catch(() => {
    });
  }, "onAbort");
  if (init.signal?.aborted) {
    onAbort();
    throw new DOMException("Aborted", "AbortError");
  }
  init.signal?.addEventListener("abort", onAbort, { once: true });
  const closeActive = /* @__PURE__ */ __name(() => {
    init.signal?.removeEventListener("abort", onAbort);
    void rawSocket.close().catch(() => {
    });
  }, "closeActive");
  try {
    const rawWriter = rawSocket.writable.getWriter();
    const rawReader = rawSocket.readable.getReader();
    const rawBr = new BufferedReader(async () => {
      const { value, done } = await rawReader.read();
      return done ? null : value ?? new Uint8Array(0);
    });
    if (proxyScheme === "socks5" || proxyScheme === "socks5h") {
      await performSocks5Handshake(rawBr, rawWriter, targetHost, targetPort, proxyUser, proxyPass);
    } else if (proxyScheme === "http") {
      await performHttpConnectHandshake(
        rawBr,
        rawWriter,
        targetHost,
        targetPort,
        proxyUser,
        proxyPass
      );
    } else {
      throw new Error(`Unsupported proxy scheme: ${proxyScheme}`);
    }
    let writeAppData;
    let appBr;
    if (isHttps) {
      const rootCertsDb = await getRootCertsDb();
      let writeQueue = Promise.resolve();
      const networkWrite = /* @__PURE__ */ __name((data) => {
        const copy = new Uint8Array(data);
        writeQueue = writeQueue.then(() => rawWriter.write(copy));
      }, "networkWrite");
      const rq = new LazyReadFunctionReadQueue(async () => {
        const chunk = await rawBr.readNextChunk();
        return chunk ?? void 0;
      });
      const tls = await startTls(
        targetHost,
        rootCertsDb,
        rq.read.bind(rq),
        networkWrite,
        { useSNI: true }
      );
      writeAppData = /* @__PURE__ */ __name(async (data) => {
        const CHUNK_SIZE = 8192;
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          await tls.write(data.subarray(offset, offset + CHUNK_SIZE));
        }
        await writeQueue;
      }, "writeAppData");
      appBr = new BufferedReader(async () => {
        const chunk = await tls.read();
        return chunk === void 0 ? null : chunk;
      });
    } else {
      writeAppData = /* @__PURE__ */ __name(async (data) => {
        await rawWriter.write(data);
      }, "writeAppData");
      appBr = rawBr;
    }
    let bodyBytes = new Uint8Array(0);
    if (typeof init.body === "string") {
      bodyBytes = encoder2.encode(init.body);
    } else if (init.body instanceof Uint8Array) {
      bodyBytes = init.body;
    } else if (init.body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(init.body);
    } else if (init.body != null) {
      bodyBytes = encoder2.encode(String(init.body));
    }
    const reqHeaders = new Headers(init.headers);
    if (!reqHeaders.has("host")) {
      reqHeaders.set("host", targetUrl.port ? `${targetHost}:${targetUrl.port}` : targetHost);
    }
    if (!reqHeaders.has("accept-encoding")) {
      reqHeaders.set("accept-encoding", "identity");
    }
    reqHeaders.set("connection", "close");
    if (bodyBytes.length > 0 || method === "POST" || method === "PUT" || method === "PATCH") {
      reqHeaders.set("content-length", String(bodyBytes.length));
    }
    const headLines = [`${method} ${pathAndQuery} HTTP/1.1`];
    reqHeaders.forEach((value, key) => {
      headLines.push(`${key}: ${value}`);
    });
    headLines.push("", "");
    const headBytes = encoder2.encode(headLines.join("\r\n"));
    await writeAppData(headBytes);
    if (bodyBytes.length > 0) {
      await writeAppData(bodyBytes);
    }
    const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
    const rawHead = await appBr.readUntil(CRLFCRLF);
    const headText = decoder2.decode(rawHead);
    const lines = headText.split("\r\n");
    const statusLine = lines[0] ?? "";
    const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
    if (!statusMatch) {
      throw new Error(`Malformed HTTP response status line: ${statusLine.slice(0, 120)}`);
    }
    const status = Number(statusMatch[1]);
    const statusText = statusMatch[2] ?? "";
    const respHeaders = new Headers();
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const colon = line.indexOf(":");
      if (colon > 0) {
        respHeaders.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      }
    }
    const te3 = (respHeaders.get("transfer-encoding") ?? "").toLowerCase();
    const isChunked = te3.includes("chunked");
    const clRaw = respHeaders.get("content-length");
    const contentLength = clRaw && /^\d+$/.test(clRaw.trim()) ? Number(clRaw.trim()) : null;
    const bodyStream = isChunked ? createChunkedBodyStream(appBr, closeActive) : createRawBodyStream(appBr, contentLength, closeActive);
    return new Response(bodyStream, {
      status,
      statusText,
      headers: respHeaders
    });
  } catch (err) {
    closeActive();
    throw err;
  }
}
__name(fetchViaProxy, "fetchViaProxy");

// src/codex-provider.ts
var CodexUpstreamError = class extends Error {
  static {
    __name(this, "CodexUpstreamError");
  }
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function extractUsage(raw) {
  const u = raw?.usage;
  if (!u || typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") {
    return null;
  }
  const details = u.input_tokens_details ?? {};
  return {
    inputTokens: u.input_tokens,
    cachedTokens: typeof details.cached_tokens === "number" ? details.cached_tokens : 0,
    cacheWriteTokens: typeof details.cache_creation_input_tokens === "number" ? details.cache_creation_input_tokens : typeof details.cache_write_tokens === "number" ? details.cache_write_tokens : 0,
    outputTokens: u.output_tokens
  };
}
__name(extractUsage, "extractUsage");
function parseOutputItems(rawItems) {
  const outputItems = [];
  const functionCalls = [];
  let fallbackText = "";
  for (const item of rawItems) {
    const type = item.type;
    if (type === "reasoning") {
      outputItems.push(item);
    } else if (type === "function_call") {
      const callId = String(item.call_id ?? "");
      const name = String(item.name ?? "");
      const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {});
      if (callId && name) {
        const fcItem = {
          type: "function_call",
          ...typeof item.id === "string" ? { id: item.id } : {},
          call_id: callId,
          name,
          arguments: args
        };
        outputItems.push(fcItem);
        functionCalls.push({
          id: typeof item.id === "string" ? item.id : void 0,
          callId,
          name,
          arguments: args
        });
      }
    } else if (type === "message") {
      const content = Array.isArray(item.content) ? item.content : [];
      const textParts = [];
      for (const part of content) {
        if (part && typeof part === "object" && typeof part.text === "string") {
          const t = part.text;
          fallbackText += t;
          textParts.push({ type: "output_text", text: t });
        }
      }
      if (textParts.length > 0) {
        outputItems.push({
          type: "message",
          role: "assistant",
          content: textParts
        });
      }
    }
  }
  return { outputItems, functionCalls, fallbackText };
}
__name(parseOutputItems, "parseOutputItems");
async function parseCodexSseStream(body, maxResponseChars, onDelta, onTruncateAbort) {
  const reader = body.getReader();
  const decoder3 = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let truncated = false;
  let completed = false;
  let finalStatus = "incomplete";
  let usage = null;
  const streamedItems = [];
  let completedResponseOutput = null;
  const processDataLine = /* @__PURE__ */ __name((rawData) => {
    const trimmed = rawData.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
      if (truncated) return;
      const remaining = maxResponseChars - streamedText.length;
      if (remaining <= 0) {
        truncated = true;
        onTruncateAbort?.();
        return;
      }
      const chunk = evt.delta.length > remaining ? evt.delta.slice(0, remaining) : evt.delta;
      streamedText += chunk;
      onDelta(chunk);
      if (streamedText.length >= maxResponseChars) {
        truncated = true;
        onTruncateAbort?.();
      }
      return;
    }
    if (evt.type === "response.output_item.done" && evt.item && typeof evt.item === "object") {
      streamedItems.push(evt.item);
      return;
    }
    if (evt.type === "response.completed") {
      completed = true;
      finalStatus = evt.response?.status ?? "completed";
      usage = extractUsage(evt.response);
      if (Array.isArray(evt.response?.output)) {
        completedResponseOutput = evt.response.output;
      }
      return;
    }
    if (evt.type === "response.failed" || evt.type === "error") {
      const errObj = evt.response?.error ?? evt.error;
      throw new CodexUpstreamError(
        502,
        errObj?.code ?? "codex_response_failed",
        errObj?.message ?? "Codex response failed"
      );
    }
  }, "processDataLine");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder3.decode(value, { stream: true });
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);
        if (line.startsWith("data:")) {
          processDataLine(line.slice(5));
        }
        if (truncated) break;
        newlineIdx = buffer.indexOf("\n");
      }
      if (truncated) break;
    }
    buffer += decoder3.decode();
    if (!truncated && buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          processDataLine(line.slice(5));
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
    }
  }
  const rawItems = completedResponseOutput ?? streamedItems;
  const { outputItems, functionCalls, fallbackText } = parseOutputItems(rawItems);
  const text = streamedText || fallbackText.slice(0, maxResponseChars);
  return {
    completed: completed || truncated,
    status: truncated ? "truncated" : finalStatus,
    text,
    truncated,
    outputItems,
    functionCalls,
    usage
  };
}
__name(parseCodexSseStream, "parseCodexSseStream");
var CodexResponsesProvider = class {
  static {
    __name(this, "CodexResponsesProvider");
  }
  env;
  db;
  fetchImpl;
  authFetchImpl;
  getCredentialsImpl;
  constructor(env, db, options = {}) {
    this.env = env;
    this.db = db;
    const proxyUrl = env.CODEX_PROXY_URL?.trim();
    const directFetch = /* @__PURE__ */ __name((input, init) => globalThis.fetch(input, init), "directFetch");
    this.authFetchImpl = options.fetchImpl ?? directFetch;
    this.fetchImpl = options.fetchImpl ?? (proxyUrl ? (input, init) => fetchViaProxy(proxyUrl, input, init) : directFetch);
    this.getCredentialsImpl = options.getCredentialsImpl;
  }
  async loadCreds(forceRefresh) {
    if (this.getCredentialsImpl) return this.getCredentialsImpl(forceRefresh);
    return getValidCodexCredentials(this.env, this.db, {
      forceRefresh,
      fetchImpl: this.authFetchImpl
    });
  }
  async runRound(req) {
    let creds = await this.loadCreds(false);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const localAbort = new AbortController();
      const onParentAbort = /* @__PURE__ */ __name(() => localAbort.abort(req.signal.reason), "onParentAbort");
      if (req.signal.aborted) {
        localAbort.abort(req.signal.reason);
      } else {
        req.signal.addEventListener("abort", onParentAbort, { once: true });
      }
      try {
        const payload = {
          model: req.model,
          instructions: req.instructions,
          input: req.input,
          tools: req.tools,
          parallel_tool_calls: true,
          store: false,
          stream: true
        };
        const headers = {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": "codex_cli_rs/0.114.0 (Linux; x86_64)",
          originator: "codex_cli_rs"
        };
        if (creds.accountId) {
          headers["ChatGPT-Account-Id"] = creds.accountId;
        }
        let resp;
        try {
          resp = await this.fetchImpl(this.env.CODEX_RESPONSES_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: localAbort.signal
          });
        } catch (fetchErr) {
          if (attempt < 2 && !req.signal.aborted) {
            continue;
          }
          throw fetchErr;
        }
        if (resp.status === 401 && attempt === 0) {
          creds = await this.loadCreds(true);
          continue;
        }
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new CodexUpstreamError(
            resp.status,
            resp.status === 429 ? "codex_rate_limited" : "codex_upstream_error",
            `Codex API HTTP ${resp.status}: ${text.slice(0, 300)}`
          );
        }
        if (!resp.body) {
          throw new CodexUpstreamError(502, "codex_empty_body", "Codex API returned empty stream");
        }
        return await parseCodexSseStream(
          resp.body,
          req.maxResponseChars,
          req.onDelta,
          () => localAbort.abort("max_response_chars")
        );
      } finally {
        req.signal.removeEventListener("abort", onParentAbort);
      }
    }
    throw new CodexUpstreamError(401, "codex_unauthorized", "Codex API rejected refreshed token");
  }
};

// src/logger.ts
function logEvent(level, event, fields = {}) {
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...fields
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
__name(logEvent, "logEvent");
function maskId(value) {
  if (!value) return null;
  return value.length <= 8 ? value : `${value.slice(0, 8)}...`;
}
__name(maskId, "maskId");

// src/stemmer.ts
var VOWELS = /[аеиоуыэюя]/;
var RVRE = /^(.*?[аеиоуыэюя])(.*)$/;
var PERFECTIVE_GERUND_1 = /([ая])(в|вши|вшись)$/;
var PERFECTIVE_GERUND_2 = /(ив|ивши|ившись|ыв|ывши|ывшись)$/;
var ADJECTIVE = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
var PARTICIPLE_1 = /([ая])(ем|нн|вш|ющ|щ)$/;
var PARTICIPLE_2 = /(ивш|ывш|ующ)$/;
var REFLEXIVE = /(ся|сь)$/;
var VERB_1 = /([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/;
var VERB_2 = /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/;
var NOUN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
var SUPERLATIVE = /(ейш|ейше)$/;
var DERIVATIONAL = /(ост|ость)$/;
var I_ENDING = /и$/;
var NN_ENDING = /нн$/;
var SOFT_SIGN = /ь$/;
function findR2(rv) {
  let seenVowel = false;
  let r1 = rv.length;
  for (let i = 0; i < rv.length; i += 1) {
    const isV = VOWELS.test(rv[i]);
    if (isV) {
      seenVowel = true;
    } else if (seenVowel) {
      r1 = i + 1;
      break;
    }
  }
  seenVowel = false;
  let r2 = rv.length;
  for (let i = r1; i < rv.length; i += 1) {
    const isV = VOWELS.test(rv[i]);
    if (isV) {
      seenVowel = true;
    } else if (seenVowel) {
      r2 = i + 1;
      break;
    }
  }
  return r2;
}
__name(findR2, "findR2");
function stemRussianWord(raw) {
  const word = raw.toLowerCase().replace(/ё/g, "\u0435");
  if (word.length < 3 || !/[а-я]/.test(word)) return word;
  const match = RVRE.exec(word);
  if (!match) return word;
  const head = match[1];
  let rv = match[2];
  if (!rv) return word;
  const r2Start = findR2(rv);
  if (PERFECTIVE_GERUND_1.test(rv)) {
    rv = rv.replace(PERFECTIVE_GERUND_1, "$1");
  } else if (PERFECTIVE_GERUND_2.test(rv)) {
    rv = rv.replace(PERFECTIVE_GERUND_2, "");
  } else {
    rv = rv.replace(REFLEXIVE, "");
    if (ADJECTIVE.test(rv)) {
      rv = rv.replace(ADJECTIVE, "");
      if (PARTICIPLE_1.test(rv)) {
        rv = rv.replace(PARTICIPLE_1, "$1");
      } else if (PARTICIPLE_2.test(rv)) {
        rv = rv.replace(PARTICIPLE_2, "");
      }
    } else if (VERB_1.test(rv)) {
      rv = rv.replace(VERB_1, "$1");
    } else if (VERB_2.test(rv)) {
      rv = rv.replace(VERB_2, "");
    } else {
      rv = rv.replace(NOUN, "");
    }
  }
  rv = rv.replace(I_ENDING, "");
  if (r2Start < rv.length) {
    const r2Part = rv.slice(r2Start);
    if (DERIVATIONAL.test(r2Part)) {
      rv = rv.slice(0, r2Start) + r2Part.replace(DERIVATIONAL, "");
    }
  }
  if (NN_ENDING.test(rv)) {
    rv = rv.slice(0, -1);
  } else {
    rv = rv.replace(SUPERLATIVE, "");
    if (NN_ENDING.test(rv)) {
      rv = rv.slice(0, -1);
    } else {
      rv = rv.replace(SOFT_SIGN, "");
    }
  }
  return head + rv;
}
__name(stemRussianWord, "stemRussianWord");
function buildFtsMatchQuery(rawQuery) {
  const rawTokens = rawQuery.toLowerCase().replace(/ё/g, "\u0435").match(/[a-zа-я0-9_]+/g);
  if (!rawTokens || rawTokens.length === 0) return "";
  const clauses = [];
  const seen = /* @__PURE__ */ new Set();
  for (const tok of rawTokens) {
    if (tok.length < 2) continue;
    const stemmed = /[а-я]/.test(tok) ? stemRussianWord(tok) : tok;
    const key = `${tok}|${stemmed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const escTok = tok.replace(/"/g, '""');
    const escStem = stemmed.replace(/"/g, '""');
    if (escStem !== escTok && escStem.length >= 2) {
      clauses.push(`("${escTok}"* OR "${escStem}"*)`);
    } else {
      clauses.push(`"${escTok}"*`);
    }
    if (clauses.length >= 8) break;
  }
  return clauses.join(" AND ");
}
__name(buildFtsMatchQuery, "buildFtsMatchQuery");

// src/tools.ts
function normalizeQuoteText(input) {
  return input.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[«»„“”]/g, '"').replace(/[‘’`]/g, "'").replace(/[—–−]/g, "-").replace(/\u00a0/g, " ").replace(/\$\$/g, "$").replace(/\\\(|\\\)|\\\[|\\\]/g, "$").replace(/\s+/g, " ").replace(/\s*([.,;:!?()[\]{}])\s*/g, "$1").replace(/\$\s+/g, "$").replace(/\s+\$/g, "$").trim().toLowerCase();
}
__name(normalizeQuoteText, "normalizeQuoteText");
function stripTexMarkupForFallback(input) {
  return normalizeQuoteText(
    input.replace(/\\(?:N|Z|Q|R|C|F)\b/g, (m) => m.slice(1)).replace(/\\(?:Id|sgn|rk|tr|Mat)\b/g, (m) => m.slice(1)).replace(/\\(?:varepsilon|eps)\b/g, "eps").replace(/\\(?:leqslant|leq|le)\b/g, "<=").replace(/\\(?:geqslant|geq|ge)\b/g, ">=").replace(/\\(?:rwv|rw)\{([^{}]*)\}/g, "$1").replace(
      /\\(?:textbf|textit|emph|text|mathrm|mathbf|mathcal|mathbb|operatorname)\{([^{}]*)\}/g,
      "$1"
    ).replace(/\[([^\]]+)\]\(#[^)]+\)/g, "$1").replace(/\[-?@[^\]]+\]/g, " ").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?)]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").replace(/\$/g, "")
  );
}
__name(stripTexMarkupForFallback, "stripTexMarkupForFallback");
function hasOrderedWordCoverage(haystack, needle) {
  const words = needle.match(/[a-zа-яё0-9]{3,}/gi) ?? [];
  if (words.length < 3) return false;
  let pos = 0;
  let matched = 0;
  for (const w of words) {
    const idx = haystack.indexOf(w, pos);
    if (idx !== -1) {
      matched += 1;
      pos = idx + w.length;
    }
  }
  return matched / words.length >= 0.8;
}
__name(hasOrderedWordCoverage, "hasOrderedWordCoverage");
function containsNormalized(haystack, needle) {
  if (!needle) return false;
  const normNeedle = normalizeQuoteText(needle);
  if (normNeedle.length < 2) return false;
  const normHaystack = normalizeQuoteText(haystack);
  if (normHaystack.includes(normNeedle)) return true;
  const plainNeedle = stripTexMarkupForFallback(needle);
  const plainHaystack = stripTexMarkupForFallback(haystack);
  if (plainNeedle.length >= 2 && plainHaystack.includes(plainNeedle)) {
    return true;
  }
  if (hasOrderedWordCoverage(plainHaystack, plainNeedle)) {
    return true;
  }
  return false;
}
__name(containsNormalized, "containsNormalized");
async function validateQuoteAgainstCourse(db, course, docId, quote) {
  if (!quote.tex || !quote.tex.trim()) return false;
  if (quote.blockId) {
    const block = await db.first(
      db.prepare(
        "SELECT course, doc_id, title, statement_tex, proof_tex FROM course_blocks WHERE id = ?"
      ).bind(quote.blockId)
    );
    if (block && block.course === course && block.doc_id === docId) {
      const combined = `${block.title}
${block.statement_tex}
${block.proof_tex}`;
      if (containsNormalized(combined, quote.tex)) return true;
    }
  }
  const doc = await db.first(
    db.prepare(
      "SELECT body_tex FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1"
    ).bind(course, docId)
  );
  if (!doc) return false;
  return containsNormalized(doc.body_tex, quote.tex);
}
__name(validateQuoteAgainstCourse, "validateQuoteAgainstCourse");
async function buildSystemPrompt(db, course, docId) {
  const docsRes = await db.all(
    db.prepare(
      "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index"
    ).bind(course)
  );
  let currentDocOrder = 0;
  let currentDocTitle = docId;
  const outlineLines = [];
  for (const d of docsRes.results) {
    const isCurrent = d.doc_id === docId;
    if (isCurrent) {
      currentDocOrder = d.order_index;
      currentDocTitle = d.title;
    }
    const marker = isCurrent ? "  \u2190 \u041C\u042B \u0417\u0414\u0415\u0421\u042C" : "";
    outlineLines.push(`- [${d.doc_kind}] ${d.doc_id}: ${d.title}${marker}`);
  }
  const outlineSection = outlineLines.length > 0 ? outlineLines.join("\n") : `- \u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442: ${course}/${docId}  \u2190 \u041C\u042B \u0417\u0414\u0415\u0421\u042C`;
  const instructions = `\u0422\u044B \u2014 \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442 \u043F\u043E \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430\u043C 1 \u043A\u0443\u0440\u0441\u0430 \u041F\u0418 \u0412\u0428\u042D \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 hse.nalinor.dev.
\u041E\u0442\u0432\u0435\u0447\u0430\u0439 \u0441\u0442\u0440\u043E\u0433\u043E \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C \u044F\u0437\u044B\u043A\u0435, \u043B\u0430\u043A\u043E\u043D\u0438\u0447\u043D\u043E, \u0442\u043E\u0447\u043D\u043E \u0438 \u043C\u0430\u0442\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E.

\u041F\u0420\u0410\u0412\u0418\u041B\u0410:
1. \u041E\u043F\u0438\u0440\u0430\u0439\u0441\u044F \u043D\u0430 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043A\u0443\u0440\u0441\u0430 \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B search_materials, read_block \u0438 read_document. \u041D\u0435 \u0432\u044B\u0434\u0443\u043C\u044B\u0432\u0430\u0439 \u043D\u043E\u043C\u0435\u0440\u0430, \u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0438 \u0442\u0435\u043E\u0440\u0435\u043C \u0438\u043B\u0438 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u043D\u0435\u0442 \u0432 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430\u0445.
2. \u0425\u0440\u043E\u043D\u043E\u043B\u043E\u0433\u0438\u044F \u043A\u0443\u0440\u0441\u0430: \u0441\u0442\u0443\u0434\u0435\u043D\u0442 \u0441\u0435\u0439\u0447\u0430\u0441 \u043E\u0442\u043A\u0440\u044B\u043B \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \xAB${currentDocTitle}\xBB (${course}/${docId}).
   - \u0415\u0441\u043B\u0438 \u0432 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430\u0445 \u043F\u043E\u0438\u0441\u043A\u0430 \u0431\u043B\u043E\u043A \u043F\u043E\u043C\u0435\u0447\u0435\u043D \`chronology: "later_in_course"\`, \u041D\u0415 \u043E\u043F\u0438\u0440\u0430\u0439\u0441\u044F \u043D\u0430 \u043D\u0435\u0433\u043E \u043A\u0430\u043A \u043D\u0430 \u0443\u0436\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u043D\u044B\u0439 \u0444\u0430\u043A\u0442 \u0431\u0435\u0437 \u044F\u0432\u043D\u043E\u0439 \u043E\u0433\u043E\u0432\u043E\u0440\u043A\u0438 (\xAB\u044D\u0442\u043E \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u0437\u0436\u0435 \u0432 \u043A\u0443\u0440\u0441\u0435\xBB).
   - \u041E\u0442\u0434\u0430\u0432\u0430\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0443 \u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0438 \u0431\u043E\u043B\u0435\u0435 \u0440\u0430\u043D\u043D\u0438\u0445 \u043B\u0435\u043A\u0446\u0438\u0439.
3. \u0421\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0431\u043B\u043E\u043A\u0438 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430 \u043E\u0444\u043E\u0440\u043C\u043B\u044F\u0439 \u0440\u043E\u0432\u043D\u043E \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 Markdown-\u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 ID \u0431\u043B\u043E\u043A\u0430, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: [\u0442\u0435\u043E\u0440\u0435\u043C\u0430 \u043E \u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u0441 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u043C](#thm:lec06:divmod) \u0438\u043B\u0438 [\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435](#def:lec01:statement). \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \`id\` \u0431\u043B\u043E\u043A\u043E\u0432, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0432\u0435\u0440\u043D\u0443\u043B\u0438 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B.
4. \u0424\u043E\u0440\u043C\u0443\u043B\u044B \u043F\u0438\u0448\u0438 \u0432 LaTeX: \u0438\u043D\u043B\u0430\u0439\u043D \`$...$\`, \u0432\u044B\u043A\u043B\u044E\u0447\u043D\u044B\u0435 \`$$...$$\`. \u041D\u0435 \u043E\u0431\u043E\u0440\u0430\u0447\u0438\u0432\u0430\u0439 LaTeX-\u0444\u043E\u0440\u043C\u0443\u043B\u044B \u0432 \u0431\u044D\u043A\u0442\u0438\u043A\u0438.
5. \u0415\u0441\u043B\u0438 \u0441\u0442\u0443\u0434\u0435\u043D\u0442 \u0437\u0430\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u0447\u0443, \u043F\u043E\u043C\u043E\u0433\u0430\u0439 \u043F\u043E\u043D\u044F\u0442\u044C \u0438\u0434\u0435\u044E \u0438 \u0448\u0430\u0433\u0438 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u0432 \u0441\u0442\u0438\u043B\u0435 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430, \u0441\u0441\u044B\u043B\u0430\u044F\u0441\u044C \u043D\u0430 \u043D\u0443\u0436\u043D\u044B\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u0438 \u0442\u0435\u043E\u0440\u0435\u043C\u044B \u043A\u0443\u0440\u0441\u0430.
6. \u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E\u0433\u043E \u0444\u0430\u043A\u0442\u0430 \u043D\u0435\u0442 \u0432 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430\u0445, \u0447\u0435\u0441\u0442\u043D\u043E \u0441\u043A\u0430\u0436\u0438 \u043E\u0431 \u044D\u0442\u043E\u043C.

\u041F\u041B\u0410\u041D \u041A\u0423\u0420\u0421\u0410 (${course}):
${outlineSection}`;
  return { instructions, currentDocOrder, currentDocTitle };
}
__name(buildSystemPrompt, "buildSystemPrompt");
var AGENT_TOOLS = [
  {
    type: "function",
    name: "search_materials",
    description: "\u0413\u0438\u0431\u0440\u0438\u0434\u043D\u044B\u0439 \u043F\u043E\u0438\u0441\u043A (FTS5 + \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u043A\u0430) \u043F\u043E \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F\u043C, \u0442\u0435\u043E\u0440\u0435\u043C\u0430\u043C, \u043B\u0435\u043C\u043C\u0430\u043C, \u0437\u0430\u0434\u0430\u0447\u0430\u043C, \u043F\u0440\u0438\u043C\u0435\u0440\u0430\u043C \u0438 \u0440\u0430\u0437\u0434\u0435\u043B\u0430\u043C \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0432. \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u0431\u043B\u043E\u043A\u043E\u0432 \u0441 ID, \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u043C, \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u043E\u043C \u0438 \u043C\u0435\u0442\u043A\u043E\u0439 chronology.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "\u041F\u043E\u0438\u0441\u043A\u043E\u0432\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C \u0438\u043B\u0438 \u0442\u043E\u0447\u043D\u044B\u0439 ID \u0431\u043B\u043E\u043A\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, thm:lec07:fta)."
        },
        course: {
          type: "string",
          description: "\u041A\u043E\u0434 \u043A\u0443\u0440\u0441\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, discrete, linalg, calculus). \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u2014 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0443\u0440\u0441."
        },
        doc_kind: {
          type: "string",
          enum: ["lecture", "theory", "prep", "program"],
          description: "\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u043F\u043E \u0442\u0438\u043F\u0443 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430."
        },
        block_kind: {
          type: "string",
          enum: [
            "theorem",
            "lemma",
            "proposition",
            "corollary",
            "definition",
            "axiom",
            "problem",
            "example",
            "remark",
            "ticket",
            "section"
          ],
          description: "\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u043F\u043E \u0442\u0438\u043F\u0443 \u0431\u043B\u043E\u043A\u0430."
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "read_block",
    description: "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0433\u043E \u0431\u043B\u043E\u043A\u0430 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430 \u043F\u043E \u0435\u0433\u043E ID, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E (\u0435\u0441\u043B\u0438 include_proof=true) \u0438 \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435/\u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0434\u0440\u0443\u0433\u0438\u0435 \u0431\u043B\u043E\u043A\u0438.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "\u0422\u043E\u0447\u043D\u044B\u0439 ID \u0431\u043B\u043E\u043A\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, thm:lec07:fta)." },
        include_proof: {
          type: "boolean",
          description: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043B\u0438 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E/\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0431\u043B\u043E\u043A\u0430 (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E true)."
        }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "read_document",
    description: "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u0438\u043B\u0438 \u0431\u043B\u043E\u043A\u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 (\u043B\u0435\u043A\u0446\u0438\u0438/\u0442\u0435\u043E\u0440\u0438\u0438/\u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438). \u0415\u0441\u043B\u0438 doc_id \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u2014 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043E\u0433\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u0443\u0440\u0441\u0430.",
    parameters: {
      type: "object",
      properties: {
        course: { type: "string", description: "\u041A\u043E\u0434 \u043A\u0443\u0440\u0441\u0430." },
        doc_id: { type: "string", description: "ID \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 07_oct16_primes_fta)." },
        section_id: { type: "string", description: "\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 ID \u0440\u0430\u0437\u0434\u0435\u043B\u0430 \u0432\u043D\u0443\u0442\u0440\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430." }
      },
      required: ["course"],
      additionalProperties: false
    }
  }
];
function classifyChronology(blockCourse, blockDocId, blockDocOrder, currentCourse, currentDocId, currentDocOrder) {
  if (blockCourse !== currentCourse) return "other_course";
  if (blockDocId === currentDocId) return "current";
  if (blockDocOrder > currentDocOrder && currentDocOrder > 0) return "later_in_course";
  return "earlier";
}
__name(classifyChronology, "classifyChronology");
function isExactBlockIdQuery(q) {
  return /^[a-z]+:[a-z0-9_:-]+$/i.test(q.trim());
}
__name(isExactBlockIdQuery, "isExactBlockIdQuery");
var AgentToolRunner = class {
  static {
    __name(this, "AgentToolRunner");
  }
  ctx;
  cache = /* @__PURE__ */ new Map();
  totalOutputChars = 0;
  constructor(ctx) {
    this.ctx = ctx;
  }
  async execute(name, rawArgs) {
    let args = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      return {
        output: JSON.stringify({ error: "Invalid JSON arguments" }),
        step: { kind: "note", note: `\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u043E\u0432 ${name}`, state: "error" },
        fromCache: false
      };
    }
    const cacheKey = `${name}:${JSON.stringify(args)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { output: cached.output, step: cached.step, fromCache: true };
    }
    let result;
    if (name === "search_materials") {
      result = await this.runSearchMaterials(args);
    } else if (name === "read_block") {
      result = await this.runReadBlock(args);
    } else if (name === "read_document") {
      result = await this.runReadDocument(args);
    } else {
      result = {
        output: JSON.stringify({ error: `Unknown tool: ${name}` }),
        step: { kind: "note", note: `\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 ${name}`, state: "error" }
      };
    }
    const remaining = Math.max(256, this.ctx.maxTotalToolOutputChars - this.totalOutputChars);
    const limit = Math.min(this.ctx.maxToolOutputChars, remaining);
    if (result.output.length > limit) {
      result.output = `${result.output.slice(0, limit - 40)}
...[truncated]`;
    }
    this.totalOutputChars += result.output.length;
    this.cache.set(cacheKey, result);
    return { ...result, fromCache: false };
  }
  async runSearchMaterials(args) {
    const query = String(args.query ?? "").trim();
    const course = typeof args.course === "string" && args.course.trim() ? args.course.trim() : this.ctx.currentCourse;
    const docKind = typeof args.doc_kind === "string" ? args.doc_kind.trim() : null;
    const blockKind = typeof args.block_kind === "string" ? args.block_kind.trim() : null;
    if (!query) {
      return {
        output: JSON.stringify({ results: [] }),
        step: { kind: "search", q: "", state: "done", res: [] }
      };
    }
    if (isExactBlockIdQuery(query)) {
      const exact = await this.ctx.db.first(
        this.ctx.db.prepare(
          "SELECT id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex FROM course_blocks WHERE id = ?"
        ).bind(query)
      );
      if (exact) {
        const item = this.formatSearchItem(exact);
        return {
          output: JSON.stringify({ results: [item], source: "exact_id" }),
          step: { kind: "search", q: query, state: "done", res: [exact.title || exact.id] }
        };
      }
    }
    const ftsQuery = buildFtsMatchQuery(query);
    const ftsRows = [];
    if (ftsQuery) {
      const filters = ["course_blocks_fts MATCH ?"];
      const binds = [ftsQuery];
      if (course && course !== "all") {
        filters.push("b.course = ?");
        binds.push(course);
      }
      if (docKind) {
        filters.push("b.doc_kind = ?");
        binds.push(docKind);
      }
      if (blockKind) {
        filters.push("b.block_kind = ?");
        binds.push(blockKind);
      }
      binds.push(12);
      try {
        const res = await this.ctx.db.all(
          this.ctx.db.prepare(
            `SELECT b.id, b.course, b.doc_kind, b.doc_id, b.doc_order, b.block_kind, b.title, b.statement_tex
               FROM course_blocks_fts
               JOIN course_blocks b ON b.id = course_blocks_fts.id
               WHERE ${filters.join(" AND ")}
               ORDER BY bm25(course_blocks_fts, 0, 0, 0, 0, 10.0, 5.0, 2.0, 4.0)
               LIMIT ?`
          ).bind(...binds)
        );
        ftsRows.push(...res.results);
      } catch {
      }
    }
    const normQ = query.toLowerCase();
    const hasExactTitleMatch = ftsRows.some((r) => r.title.toLowerCase().includes(normQ));
    const vecRows = [];
    if (!hasExactTitleMatch && this.ctx.env.VECTORIZE && this.ctx.env.AI) {
      try {
        const emb = await this.ctx.env.AI.run("@cf/baai/bge-m3", {
          text: [query]
        });
        const vector = emb?.data?.[0];
        if (vector && vector.length > 0) {
          const vecRes = await this.ctx.env.VECTORIZE.query(vector, {
            topK: 10,
            returnMetadata: "none"
          });
          const candidateIds = vecRes.matches.map((m) => m.id).filter((id) => typeof id === "string" && id.length > 0).slice(0, 10);
          if (candidateIds.length > 0) {
            const placeholders = candidateIds.map(() => "?").join(", ");
            const filters = [`id IN (${placeholders})`];
            const binds = [...candidateIds];
            if (course && course !== "all") {
              filters.push("course = ?");
              binds.push(course);
            }
            if (docKind) {
              filters.push("doc_kind = ?");
              binds.push(docKind);
            }
            if (blockKind) {
              filters.push("block_kind = ?");
              binds.push(blockKind);
            }
            const verified = await this.ctx.db.all(
              this.ctx.db.prepare(
                `SELECT id, course, doc_kind, doc_id, doc_order, block_kind, title, statement_tex
                   FROM course_blocks
                   WHERE ${filters.join(" AND ")}`
              ).bind(...binds)
            );
            const byId = new Map(verified.results.map((r) => [r.id, r]));
            for (const cid of candidateIds) {
              const row = byId.get(cid);
              if (row) vecRows.push(row);
            }
          }
        }
      } catch {
      }
    }
    const RRF_K = 60;
    const scoreById = /* @__PURE__ */ new Map();
    ftsRows.forEach((row, i) => {
      const prev = scoreById.get(row.id);
      const add = 1 / (RRF_K + i + 1);
      scoreById.set(row.id, { score: (prev?.score ?? 0) + add, row });
    });
    vecRows.forEach((row, i) => {
      const prev = scoreById.get(row.id);
      const add = 1 / (RRF_K + i + 1);
      scoreById.set(row.id, { score: (prev?.score ?? 0) + add, row });
    });
    const merged = Array.from(scoreById.values()).sort((a, b) => b.score - a.score).slice(0, 8).map((entry) => this.formatSearchItem(entry.row));
    const labels = merged.slice(0, 3).map((m) => m.title || m.id);
    const more = Math.max(0, merged.length - labels.length);
    return {
      output: JSON.stringify({
        results: merged,
        usedSemantic: vecRows.length > 0
      }),
      step: {
        kind: "search",
        q: query,
        state: "done",
        res: labels,
        ...more > 0 ? { more } : {}
      }
    };
  }
  formatSearchItem(row) {
    const snippet = row.statement_tex.length > 420 ? `${row.statement_tex.slice(0, 419).trimEnd()}\u2026` : row.statement_tex;
    return {
      id: row.id,
      course: row.course,
      doc_kind: row.doc_kind,
      doc_id: row.doc_id,
      block_kind: row.block_kind,
      title: row.title,
      snippet,
      chronology: classifyChronology(
        row.course,
        row.doc_id,
        row.doc_order,
        this.ctx.currentCourse,
        this.ctx.currentDocId,
        this.ctx.currentDocOrder
      )
    };
  }
  async runReadBlock(args) {
    const id = String(args.id ?? "").trim();
    const includeProof = args.include_proof !== false;
    if (!id) {
      return {
        output: JSON.stringify({ error: "Missing block id" }),
        step: { kind: "read", target: "", state: "error" }
      };
    }
    const [blockRes, outRes, inRes] = await this.ctx.db.batch([
      this.ctx.db.prepare(
        `SELECT id, course, doc_kind, doc_id, doc_order, block_kind, section_id, title, statement_tex, proof_tex
           FROM course_blocks WHERE id = ?`
      ).bind(id),
      this.ctx.db.prepare(
        `SELECT r.to_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.to_block_id
           WHERE r.from_block_id = ?
           LIMIT 12`
      ).bind(id),
      this.ctx.db.prepare(
        `SELECT r.from_block_id AS id, b.title, b.block_kind
           FROM block_references r
           LEFT JOIN course_blocks b ON b.id = r.from_block_id
           WHERE r.to_block_id = ?
           LIMIT 12`
      ).bind(id)
    ]);
    const block = blockRes?.results[0];
    if (!block) {
      return {
        output: JSON.stringify({ error: `Block not found: ${id}` }),
        step: { kind: "read", target: id, state: "error" }
      };
    }
    const payload = {
      id: block.id,
      course: block.course,
      doc_kind: block.doc_kind,
      doc_id: block.doc_id,
      block_kind: block.block_kind,
      section_id: block.section_id,
      title: block.title,
      chronology: classifyChronology(
        block.course,
        block.doc_id,
        block.doc_order,
        this.ctx.currentCourse,
        this.ctx.currentDocId,
        this.ctx.currentDocOrder
      ),
      statement_tex: block.statement_tex,
      ...includeProof && block.proof_tex ? { proof_tex: block.proof_tex } : {},
      outgoing_refs: outRes?.results ?? [],
      incoming_refs: inRes?.results ?? []
    };
    return {
      output: JSON.stringify(payload),
      step: { kind: "read", target: block.title || block.id, state: "done" }
    };
  }
  async runReadDocument(args) {
    const course = typeof args.course === "string" && args.course.trim() ? args.course.trim() : this.ctx.currentCourse;
    const docId = typeof args.doc_id === "string" && args.doc_id.trim() ? args.doc_id.trim() : null;
    const sectionId = typeof args.section_id === "string" && args.section_id.trim() ? args.section_id.trim() : null;
    if (!docId) {
      const docs = await this.ctx.db.all(
        this.ctx.db.prepare(
          "SELECT doc_kind, doc_id, order_index, title, date FROM course_documents WHERE course = ? ORDER BY doc_kind, order_index LIMIT 60"
        ).bind(course)
      );
      return {
        output: JSON.stringify({ course, documents: docs.results }),
        step: { kind: "read", target: `\u041E\u0433\u043B\u0430\u0432\u043B\u0435\u043D\u0438\u0435 ${course}`, state: "done" }
      };
    }
    const doc = await this.ctx.db.first(
      this.ctx.db.prepare(
        "SELECT doc_kind, doc_id, order_index, title, outline_json FROM course_documents WHERE course = ? AND doc_id = ? LIMIT 1"
      ).bind(course, docId)
    );
    if (!doc) {
      return {
        output: JSON.stringify({ error: `Document not found: ${course}/${docId}` }),
        step: { kind: "read", target: docId, state: "error" }
      };
    }
    const blocks = sectionId ? await this.ctx.db.all(
      this.ctx.db.prepare(
        `SELECT id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ? AND (section_id = ? OR id = ?)
               ORDER BY block_order
               LIMIT 30`
      ).bind(course, docId, sectionId, sectionId)
    ) : await this.ctx.db.all(
      this.ctx.db.prepare(
        `SELECT id, block_kind, title, statement_tex
               FROM course_blocks
               WHERE course = ? AND doc_id = ?
               ORDER BY block_order
               LIMIT 30`
      ).bind(course, docId)
    );
    const compactBlocks = blocks.results.map((b) => ({
      id: b.id,
      block_kind: b.block_kind,
      title: b.title,
      statement_tex: b.statement_tex.length > 600 ? `${b.statement_tex.slice(0, 599).trimEnd()}\u2026` : b.statement_tex
    }));
    return {
      output: JSON.stringify({
        course,
        doc_kind: doc.doc_kind,
        doc_id: doc.doc_id,
        title: doc.title,
        chronology: classifyChronology(
          course,
          doc.doc_id,
          doc.order_index,
          this.ctx.currentCourse,
          this.ctx.currentDocId,
          this.ctx.currentDocOrder
        ),
        outline: JSON.parse(doc.outline_json),
        blocks: compactBlocks
      }),
      step: { kind: "read", target: sectionId ? `${doc.title} (${sectionId})` : doc.title, state: "done" }
    };
  }
};

// src/agent-loop.ts
function formatUserTurnContent(text, quote) {
  if (!quote) return text;
  const header = quote.blockId ? `\u0426\u0438\u0442\u0430\u0442\u0430 \u0438\u0437 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430 (${quote.label}, \u0431\u043B\u043E\u043A #${quote.blockId}):` : `\u0426\u0438\u0442\u0430\u0442\u0430 \u0438\u0437 \u043A\u043E\u043D\u0441\u043F\u0435\u043A\u0442\u0430 (${quote.label}):`;
  return `${header}
> ${quote.tex}

\u0412\u043E\u043F\u0440\u043E\u0441 \u0441\u0442\u0443\u0434\u0435\u043D\u0442\u0430:
${text}`;
}
__name(formatUserTurnContent, "formatUserTurnContent");
function extractPreviewArg(rawArgs, field) {
  try {
    const parsed = JSON.parse(rawArgs);
    return typeof parsed[field] === "string" ? parsed[field] : "";
  } catch {
    return "";
  }
}
__name(extractPreviewArg, "extractPreviewArg");
async function loadThreadHistoryInput(db, threadId, excludeRunId, excludeMessageIds, policy) {
  const excluded = new Set(excludeMessageIds);
  const rows = await db.all(
    db.prepare(
      `SELECT id, role, status, content_tex, quote_json
         FROM chat_messages
         WHERE thread_id = ? AND (run_id IS NULL OR run_id != ?) AND status IN ('done', 'stopped', 'incomplete')
         ORDER BY seq DESC
         LIMIT ?`
    ).bind(threadId, excludeRunId, policy.maxHistoryMessages + excluded.size)
  );
  const chronological = [...rows.results].filter((r) => !excluded.has(r.id)).slice(0, policy.maxHistoryMessages).reverse();
  const items = [];
  let charBudget = policy.maxHistoryChars;
  const selected = [];
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const r = chronological[i];
    const len = r.content_tex.length + (r.quote_json?.length ?? 0);
    if (len > charBudget && selected.length > 0) break;
    charBudget -= len;
    selected.unshift(r);
  }
  for (const r of selected) {
    let quote = null;
    if (r.quote_json) {
      try {
        quote = JSON.parse(r.quote_json);
      } catch {
        quote = null;
      }
    }
    if (r.role === "user") {
      items.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: formatUserTurnContent(r.content_tex, quote) }]
      });
    } else if (r.content_tex.trim()) {
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: r.content_tex }]
      });
    }
  }
  return items;
}
__name(loadThreadHistoryInput, "loadThreadHistoryInput");
async function executeAgentRun(params) {
  const {
    env,
    db,
    provider,
    policy,
    runId,
    threadId,
    course,
    docId,
    tier,
    bucket,
    model,
    degraded,
    questionText,
    quote,
    signal,
    isStoppedByUser,
    sendFrame
  } = params;
  const steps = [];
  const turnNewAgentItems = [];
  let currentReservedMicros = params.initialReserveMicros;
  let cumulativeCostMicros = 0;
  let totalInputTokens = 0;
  let totalCachedTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalOutputTokens = 0;
  let roundsCompleted = 0;
  let totalToolCalls = 0;
  let accumulatedText = "";
  let isCostUncertain = false;
  let estimatedPromptChars = 0;
  const { instructions, currentDocOrder } = await buildSystemPrompt(db, course, docId);
  const historyItems = await loadThreadHistoryInput(
    db,
    threadId,
    runId,
    params.excludeMessageIds ?? [],
    policy
  );
  const userTurnItem = {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: formatUserTurnContent(questionText, quote) }]
  };
  const conversationInput = [...historyItems, userTurnItem];
  const toolRunner = new AgentToolRunner({
    env,
    db,
    currentCourse: course,
    currentDocId: docId,
    currentDocOrder,
    maxToolOutputChars: policy.maxToolOutputChars,
    maxTotalToolOutputChars: policy.maxTotalToolOutputChars
  });
  const timeoutAbort = new AbortController();
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    timeoutAbort.abort("run_timeout");
  }, policy.maxRunDurationMs);
  const onExternalAbort = /* @__PURE__ */ __name(() => timeoutAbort.abort(signal.reason), "onExternalAbort");
  if (signal.aborted) {
    timeoutAbort.abort(signal.reason);
  } else {
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    let allowTools = true;
    for (let round = 1; round <= policy.maxToolRounds; round += 1) {
      if (timeoutAbort.signal.aborted) break;
      const isFinalAllowedRound = round === policy.maxToolRounds || !allowTools;
      const toolsForRound = isFinalAllowedRound ? [] : AGENT_TOOLS;
      estimatedPromptChars = instructions.length + conversationInput.reduce((acc, item) => acc + JSON.stringify(item).length, 0);
      let roundText = "";
      const remainingChars = Math.max(200, policy.maxResponseChars - accumulatedText.length);
      const roundStartMs = Date.now();
      const roundRes = await provider.runRound({
        model,
        instructions,
        input: conversationInput,
        tools: toolsForRound,
        maxResponseChars: remainingChars,
        signal: timeoutAbort.signal,
        onDelta: /* @__PURE__ */ __name((delta) => {
          roundText += delta;
          accumulatedText += delta;
          sendFrame({ type: "delta", text: delta });
        }, "onDelta")
      });
      const roundDurationMs = Date.now() - roundStartMs;
      logEvent(roundRes.completed ? "info" : "warn", "codex_round", {
        runId,
        round,
        model,
        completed: roundRes.completed,
        status: roundRes.status,
        truncated: roundRes.truncated,
        durationMs: roundDurationMs,
        textChars: roundText.length,
        toolCalls: roundRes.functionCalls.map((f) => f.name),
        usage: roundRes.usage
      });
      if (!roundRes.completed) {
        isCostUncertain = true;
        break;
      }
      roundsCompleted += 1;
      if (roundRes.usage) {
        const roundCost = computeRoundCostMicros(model, roundRes.usage);
        cumulativeCostMicros += roundCost;
        totalInputTokens += roundRes.usage.inputTokens;
        totalCachedTokens += roundRes.usage.cachedTokens;
        totalCacheWriteTokens += roundRes.usage.cacheWriteTokens;
        totalOutputTokens += roundRes.usage.outputTokens;
      } else {
        isCostUncertain = true;
      }
      for (const item of roundRes.outputItems) {
        conversationInput.push(item);
        turnNewAgentItems.push(item);
      }
      const cp = await checkpointRound(db, policy, {
        runId,
        tier,
        bucket,
        currentReservedMicros,
        cumulativeActualMicros: cumulativeCostMicros,
        inputTokens: totalInputTokens,
        cachedTokens: totalCachedTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        outputTokens: totalOutputTokens,
        toolRounds: roundsCompleted,
        toolCalls: totalToolCalls,
        nowMs: Date.now()
      });
      currentReservedMicros = cp.updatedReservedMicros;
      if (!cp.canContinueToolRounds) {
        allowTools = false;
      }
      if (roundRes.functionCalls.length === 0 || roundRes.truncated || isFinalAllowedRound) {
        if (!accumulatedText && roundRes.text) {
          accumulatedText = roundRes.text;
          sendFrame({ type: "delta", text: roundRes.text });
        }
        break;
      }
      for (const fc of roundRes.functionCalls) {
        if (timeoutAbort.signal.aborted) break;
        if (totalToolCalls >= policy.maxToolCalls) {
          const capItem = {
            type: "function_call_output",
            call_id: fc.callId,
            output: JSON.stringify({
              error: "Tool call limit reached for this turn. Answer using already gathered materials."
            })
          };
          conversationInput.push(capItem);
          turnNewAgentItems.push(capItem);
          allowTools = false;
          continue;
        }
        totalToolCalls += 1;
        const runningStep = fc.name === "search_materials" ? { kind: "search", q: extractPreviewArg(fc.arguments, "query"), state: "running" } : {
          kind: "read",
          target: extractPreviewArg(fc.arguments, "id") || extractPreviewArg(fc.arguments, "doc_id") || extractPreviewArg(fc.arguments, "course"),
          state: "running"
        };
        const stepIdx = steps.push(runningStep) - 1;
        sendFrame({ type: "step", steps: [...steps] });
        const toolResult = await toolRunner.execute(fc.name, fc.arguments);
        steps[stepIdx] = toolResult.step;
        sendFrame({ type: "step", steps: [...steps] });
        const outputItem = {
          type: "function_call_output",
          call_id: fc.callId,
          output: toolResult.output
        };
        conversationInput.push(outputItem);
        turnNewAgentItems.push(outputItem);
      }
      if (roundText && !roundText.endsWith("\n")) {
        accumulatedText += "\n\n";
        sendFrame({ type: "delta", text: "\n\n" });
      }
    }
    let finalStatus = "done";
    let errorCode = null;
    let errorMessage = null;
    if (isStoppedByUser()) {
      finalStatus = "stopped";
      isCostUncertain = true;
    } else if (timedOut) {
      finalStatus = "incomplete";
      errorCode = "run_timeout";
      errorMessage = "\u0412\u0440\u0435\u043C\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043E\u0442\u0432\u0435\u0442\u0430 \u0438\u0441\u0442\u0435\u043A\u043B\u043E (60 \u0441).";
      isCostUncertain = true;
    } else if (isCostUncertain && !accumulatedText.trim()) {
      finalStatus = "error";
      errorCode = "upstream_incomplete";
      errorMessage = "\u0421\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0441 \u043C\u043E\u0434\u0435\u043B\u044C\u044E \u043F\u0440\u0435\u0440\u0432\u0430\u043B\u043E\u0441\u044C \u0434\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043E\u0442\u0432\u0435\u0442\u0430.";
    }
    await finalizeRunAtomic(db, {
      runId,
      finalStatus,
      messageStatus: finalStatus,
      contentTex: accumulatedText,
      stepsJson: steps.length > 0 ? JSON.stringify(steps) : null,
      agentItemsJson: turnNewAgentItems.length > 0 ? JSON.stringify(turnNewAgentItems.slice(-24)) : null,
      errorCode,
      errorMessage,
      actualCostMicros: cumulativeCostMicros,
      isCostUncertain,
      estimatedPromptChars,
      streamedOutputChars: accumulatedText.length,
      inputTokens: totalInputTokens,
      cachedTokens: totalCachedTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      outputTokens: totalOutputTokens,
      toolRounds: roundsCompleted,
      toolCalls: totalToolCalls
    });
    sendFrame({
      type: "done",
      runId,
      status: finalStatus,
      text: accumulatedText,
      steps,
      degraded,
      block: null
    });
  } catch (err) {
    const abortedByUser = isStoppedByUser();
    const isAuthErr = err instanceof CodexAuthError;
    const isUpstreamErr = err instanceof CodexUpstreamError;
    logEvent(abortedByUser ? "info" : "error", "agent_run_exception", {
      runId,
      threadId,
      course,
      docId,
      model,
      abortedByUser,
      timedOut,
      roundsCompleted,
      totalToolCalls,
      errCode: isAuthErr || isUpstreamErr ? err.code : "internal_error",
      upstreamStatus: isUpstreamErr ? err.status : void 0,
      errMessage: err instanceof Error ? err.message.slice(0, 500) : String(err)
    });
    const finalStatus = abortedByUser ? "stopped" : timedOut ? "incomplete" : "error";
    const errorCode = abortedByUser ? "user_stopped" : timedOut ? "run_timeout" : isAuthErr ? err.code : isUpstreamErr ? err.code : "internal_error";
    const rawErrDetail = (err instanceof Error ? err.message : String(err)).trim().slice(0, 400);
    const errorMessage = abortedByUser ? null : isAuthErr ? `\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438 Codex (${err.code}): ${rawErrDetail} [run: ${runId}]` : isUpstreamErr ? `\u041E\u0448\u0438\u0431\u043A\u0430 \u043C\u043E\u0434\u0435\u043B\u0438 HTTP ${err.status} (${err.code}): ${rawErrDetail} [run: ${runId}]` : `\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (${errorCode}): ${rawErrDetail} [run: ${runId}]`;
    await finalizeRunAtomic(db, {
      runId,
      finalStatus,
      messageStatus: finalStatus,
      contentTex: accumulatedText,
      stepsJson: steps.length > 0 ? JSON.stringify(steps) : null,
      agentItemsJson: turnNewAgentItems.length > 0 ? JSON.stringify(turnNewAgentItems.slice(-24)) : null,
      errorCode,
      errorMessage,
      actualCostMicros: cumulativeCostMicros,
      isCostUncertain: true,
      estimatedPromptChars,
      streamedOutputChars: accumulatedText.length,
      inputTokens: totalInputTokens,
      cachedTokens: totalCachedTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      outputTokens: totalOutputTokens,
      toolRounds: roundsCompleted,
      toolCalls: totalToolCalls
    });
    if (abortedByUser) {
      sendFrame({
        type: "done",
        runId,
        status: "stopped",
        text: accumulatedText,
        steps,
        degraded,
        block: null
      });
    } else {
      sendFrame({
        type: "error",
        code: errorCode,
        message: errorMessage ?? "\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438",
        block: isAuthErr ? { code: "oauth_unavailable" } : null
      });
    }
  } finally {
    clearTimeout(timeoutTimer);
    signal.removeEventListener("abort", onExternalAbort);
  }
}
__name(executeAgentRun, "executeAgentRun");

// src/archiver.ts
var DAY_MS2 = 864e5;
function r2ToArchiveStorage(bucket) {
  return {
    async head(key) {
      return await bucket.head(key) !== null;
    },
    async putIfAbsent(key, body) {
      const existing = await bucket.head(key);
      if (existing !== null) return false;
      await bucket.put(key, body, {
        httpMetadata: { contentType: "application/gzip" }
      });
      return true;
    },
    async getBytes(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    }
  };
}
__name(r2ToArchiveStorage, "r2ToArchiveStorage");
async function gzipBytes(raw) {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(raw).then(() => writer.close());
  const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  await writePromise;
  return out;
}
__name(gzipBytes, "gzipBytes");
async function sha256HexBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i += 1) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}
__name(sha256HexBytes, "sha256HexBytes");
async function runArchiveBatch(db, storage, options = {}) {
  const now = options.nowMs ?? Date.now();
  const archiveAfterDays = options.archiveAfterDays ?? 30;
  const batchLimit = options.batchLimit ?? 50;
  const cutoff = now - archiveAfterDays * DAY_MS2;
  const stats = {
    threadsFound: 0,
    threadsDeleted: 0,
    threadsSkippedRace: 0,
    runsFound: 0,
    runsDeleted: 0,
    archivesWritten: 0,
    noncesCleaned: 0,
    sessionsCleaned: 0
  };
  const [nonceRes, sessRes] = await db.batch([
    db.prepare(
      "DELETE FROM auth_nonces WHERE rowid IN (SELECT rowid FROM auth_nonces WHERE expires_at < ? LIMIT 200)"
    ).bind(now),
    db.prepare(
      "DELETE FROM user_sessions WHERE rowid IN (SELECT rowid FROM user_sessions WHERE expires_at < ? LIMIT 200)"
    ).bind(now)
  ]);
  stats.noncesCleaned = nonceRes?.meta?.changes ?? 0;
  stats.sessionsCleaned = sessRes?.meta?.changes ?? 0;
  const threadsRes = await db.all(
    db.prepare(
      `SELECT id, course, doc_id, title, browser_id, telegram_id, created_at, updated_at
         FROM chat_threads
         WHERE updated_at < ?
         ORDER BY updated_at ASC
         LIMIT ?`
    ).bind(cutoff, batchLimit)
  );
  stats.threadsFound = threadsRes.results.length;
  const runsRes = await db.all(
    db.prepare(
      `SELECT * FROM usage_runs
         WHERE created_at < ? AND status != 'running'
         ORDER BY created_at ASC
         LIMIT ?`
    ).bind(cutoff, batchLimit * 4)
  );
  stats.runsFound = runsRes.results.length;
  if (!storage) {
    logEvent("info", "archive_skipped_no_bucket", { ...stats });
    return stats;
  }
  const byDay = /* @__PURE__ */ new Map();
  for (const thr of threadsRes.results) {
    const dayStr = new Date(thr.updated_at).toISOString().slice(0, 10);
    const msgsRes = await db.all(
      db.prepare(
        `SELECT id, seq, role, status, content_tex, quote_json, steps_json, error_message, run_id, created_at, updated_at
           FROM chat_messages
           WHERE thread_id = ?
           ORDER BY seq ASC`
      ).bind(thr.id)
    );
    const bucket = byDay.get(dayStr) ?? [];
    bucket.push({ kind: "thread", thread: thr, messages: msgsRes.results });
    byDay.set(dayStr, bucket);
  }
  for (const run of runsRes.results) {
    const createdAt = typeof run.created_at === "number" ? run.created_at : now;
    const dayStr = new Date(createdAt).toISOString().slice(0, 10);
    const bucket = byDay.get(dayStr) ?? [];
    bucket.push({ kind: "usage_run", run });
    byDay.set(dayStr, bucket);
  }
  const encoder4 = new TextEncoder();
  for (const [dayStr, records] of byDay.entries()) {
    const jsonl = `${records.map((r) => JSON.stringify(r)).join("\n")}
`;
    const gz = await gzipBytes(encoder4.encode(jsonl));
    const digest = await sha256HexBytes(gz);
    const key = `archives/${dayStr}/${digest}.jsonl.gz`;
    await storage.putIfAbsent(key, gz);
    const readBack = await storage.getBytes(key);
    if (!readBack || await sha256HexBytes(readBack) !== digest) {
      throw new Error(`Archive checksum verification failed for ${key}`);
    }
    stats.archivesWritten += 1;
    for (const rec of records) {
      if (rec.kind === "thread") {
        const thr = rec.thread;
        const del = await db.run(
          db.prepare(
            `DELETE FROM chat_threads
               WHERE id = ? AND updated_at = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM usage_runs
                   WHERE thread_id = chat_threads.id AND status = 'running'
                 )`
          ).bind(thr.id, thr.updated_at)
        );
        if ((del.meta?.changes ?? 0) >= 1) {
          stats.threadsDeleted += 1;
        } else {
          stats.threadsSkippedRace += 1;
        }
      } else if (rec.kind === "usage_run") {
        const r = rec.run;
        const del = await db.run(
          db.prepare("DELETE FROM usage_runs WHERE id = ? AND status != 'running'").bind(r.id)
        );
        stats.runsDeleted += del.meta?.changes ?? 0;
      }
    }
  }
  logEvent("info", "archive_batch_complete", { ...stats, ...db.telemetry.snapshot() });
  return stats;
}
__name(runArchiveBatch, "runArchiveBatch");

// src/db.ts
var DbTelemetry = class {
  static {
    __name(this, "DbTelemetry");
  }
  dbCalls = 0;
  sqlStatements = 0;
  rowsRead = 0;
  rowsWritten = 0;
  sqlDurationMs = 0;
  recordMeta(meta, isNewCall) {
    if (isNewCall) this.dbCalls += 1;
    this.sqlStatements += 1;
    if (!meta) return;
    if (typeof meta.rows_read === "number") this.rowsRead += meta.rows_read;
    if (typeof meta.rows_written === "number") this.rowsWritten += meta.rows_written;
    if (typeof meta.duration === "number") this.sqlDurationMs += meta.duration;
  }
  snapshot() {
    return {
      db_calls: this.dbCalls,
      sql_statements: this.sqlStatements,
      rows_read: this.rowsRead,
      rows_written: this.rowsWritten,
      sql_duration_ms: Number(this.sqlDurationMs.toFixed(2))
    };
  }
};
var TrackedD1 = class {
  static {
    __name(this, "TrackedD1");
  }
  raw;
  telemetry;
  constructor(db, telemetry = new DbTelemetry()) {
    this.raw = db;
    this.telemetry = telemetry;
  }
  prepare(query) {
    return this.raw.prepare(query);
  }
  async first(stmt) {
    const res = await stmt.all();
    this.telemetry.recordMeta(res.meta, true);
    return res.results[0] ?? null;
  }
  async all(stmt) {
    const res = await stmt.all();
    this.telemetry.recordMeta(res.meta, true);
    return res;
  }
  async run(stmt) {
    const res = await stmt.run();
    this.telemetry.recordMeta(res.meta, true);
    return res;
  }
  async batch(stmts) {
    if (stmts.length === 0) return [];
    const results = await this.raw.batch(stmts);
    results.forEach((res, idx) => {
      this.telemetry.recordMeta(res.meta, idx === 0);
    });
    return results;
  }
};

// src/chat-runner.ts
var AUTH_FRAME_TIMEOUT_MS = 5e3;
var encoder3 = new TextEncoder();
var ChatRunner = class extends DurableObject {
  static {
    __name(this, "ChatRunner");
  }
  /** RPC entrypoint called by the daily Cron Trigger (runs with DO 30s CPU budget). */
  async runDailyArchive() {
    const db = new TrackedD1(this.env.DB);
    const storage = this.env.ARCHIVE_BUCKET ? r2ToArchiveStorage(this.env.ARCHIVE_BUCKET) : null;
    return runArchiveBatch(db, storage);
  }
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const upgradeCookieHeader = request.headers.get("Cookie");
    const clientIp = normalizeIpAddress(
      request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")
    );
    let socketOpen = true;
    let receivedSend = false;
    let stoppedByUser = false;
    let activeAbort = null;
    const safeSend = /* @__PURE__ */ __name((frame) => {
      if (!socketOpen) return;
      try {
        server.send(JSON.stringify(frame));
      } catch {
        socketOpen = false;
      }
    }, "safeSend");
    const safeClose = /* @__PURE__ */ __name((code = 1e3, reason = "done") => {
      if (!socketOpen) return;
      socketOpen = false;
      try {
        server.close(code, reason);
      } catch {
      }
    }, "safeClose");
    const authTimeout = setTimeout(() => {
      if (!receivedSend) {
        safeSend({ type: "error", code: "auth_timeout", message: "No initial send frame received" });
        safeClose(4008, "auth_timeout");
      }
    }, AUTH_FRAME_TIMEOUT_MS);
    server.addEventListener("close", () => {
      socketOpen = false;
      clearTimeout(authTimeout);
    });
    server.addEventListener("error", () => {
      socketOpen = false;
      clearTimeout(authTimeout);
    });
    server.addEventListener("message", (event) => {
      const raw = event.data;
      const byteLength = typeof raw === "string" ? encoder3.encode(raw).byteLength : raw instanceof ArrayBuffer ? raw.byteLength : 0;
      if (byteLength === 0 || byteLength > 40960) {
        safeSend({ type: "error", code: "payload_too_large", message: "Frame exceeds maximum size" });
        safeClose(1009, "payload_too_large");
        return;
      }
      if (typeof raw !== "string") {
        safeSend({ type: "error", code: "invalid_frame", message: "Expected UTF-8 JSON frame" });
        safeClose(1003, "invalid_frame");
        return;
      }
      let frame;
      try {
        frame = JSON.parse(raw);
      } catch {
        safeSend({ type: "error", code: "invalid_json", message: "Malformed JSON frame" });
        safeClose(1007, "invalid_json");
        return;
      }
      if (frame.type === "stop") {
        stoppedByUser = true;
        activeAbort?.abort("user_stop");
        return;
      }
      if (frame.type !== "send") {
        safeSend({ type: "error", code: "unknown_frame_type", message: "Unknown WS frame type" });
        return;
      }
      if (receivedSend) {
        safeSend({
          type: "error",
          code: "duplicate_send",
          message: "Only one send frame is allowed per WebSocket connection"
        });
        return;
      }
      receivedSend = true;
      clearTimeout(authTimeout);
      activeAbort = new AbortController();
      const abortCtrl = activeAbort;
      const runPromise = this.handleSendFrame({
        frame,
        byteLength,
        upgradeCookieHeader,
        clientIp,
        signal: abortCtrl.signal,
        isStoppedByUser: /* @__PURE__ */ __name(() => stoppedByUser, "isStoppedByUser"),
        safeSend,
        safeClose
      });
      this.ctx.waitUntil(runPromise);
    });
    return new Response(null, { status: 101, webSocket: client });
  }
  async handleSendFrame(opts) {
    const {
      frame,
      byteLength,
      upgradeCookieHeader,
      clientIp,
      signal,
      isStoppedByUser,
      safeSend,
      safeClose
    } = opts;
    const db = new TrackedD1(this.env.DB);
    let loggedRunId = "unadmitted";
    try {
      const policy = await loadPolicy(db);
      if (byteLength > policy.maxBodyBytes) {
        safeSend({ type: "error", code: "payload_too_large", message: "Message body exceeds limit" });
        safeClose(1009, "payload_too_large");
        return;
      }
      const btCheck = await resolveBrowserToken(
        this.env.BROWSER_TOKEN_SECRET,
        upgradeCookieHeader,
        frame.browserToken
      );
      if (btCheck.status === "mismatch") {
        safeSend({
          type: "error",
          code: "browser_token_mismatch",
          message: "Browser token mismatch between cookie and localStorage"
        });
        safeClose(4409, "browser_token_mismatch");
        return;
      }
      if (btCheck.status === "missing") {
        safeSend({
          type: "error",
          code: "browser_token_required",
          message: "Valid browserToken required"
        });
        safeClose(4401, "browser_token_required");
        return;
      }
      const allowance = await verifyAllowanceToken(
        this.env,
        db,
        frame.allowanceToken,
        btCheck.browserId
      );
      if (!allowance) {
        safeSend({
          type: "error",
          code: "allowance_expired",
          message: "Allowance expired or revoked. Refresh allowance."
        });
        safeClose(4401, "allowance_expired");
        return;
      }
      const questionText = typeof frame.text === "string" ? frame.text.trim() : "";
      const course = typeof frame.course === "string" ? frame.course.trim() : "";
      const docId = typeof frame.docId === "string" ? frame.docId.trim() : "";
      const clientRequestId = typeof frame.clientRequestId === "string" ? frame.clientRequestId.trim() : "";
      const quote = frame.quote ?? null;
      if (!course || !docId || !clientRequestId || clientRequestId.length > 128) {
        safeSend({ type: "error", code: "invalid_request", message: "Missing required fields" });
        safeClose(4400, "invalid_request");
        return;
      }
      if (!questionText && !quote) {
        safeSend({ type: "error", code: "empty_question", message: "Question or quote is required" });
        safeClose(4400, "empty_question");
        return;
      }
      if (questionText.length > policy.maxQuestionChars) {
        safeSend({
          type: "error",
          code: "question_too_long",
          message: `Question exceeds ${policy.maxQuestionChars} chars`
        });
        safeClose(4400, "question_too_long");
        return;
      }
      if (quote) {
        if (typeof quote.tex !== "string" || quote.tex.length > policy.maxQuoteChars) {
          safeSend({ type: "error", code: "invalid_quote", message: "Quote exceeds limit or invalid" });
          safeClose(4400, "invalid_quote");
          return;
        }
        const validQuote = await validateQuoteAgainstCourse(db, course, docId, quote);
        if (!validQuote) {
          safeSend({
            type: "error",
            code: "invalid_quote",
            message: "Attached quote was not found in the current lecture notes"
          });
          safeClose(4400, "invalid_quote");
          return;
        }
      }
      const retryAssistantMessageId = typeof frame.retryAssistantMessageId === "string" && frame.retryAssistantMessageId.trim() ? frame.retryAssistantMessageId.trim() : null;
      const payloadHash = await sha256Hex(
        JSON.stringify({
          threadId: frame.threadId ?? null,
          retryAssistantMessageId,
          course,
          docId,
          text: questionText,
          quote: quote ? { blockId: quote.blockId ?? null, tex: quote.tex } : null
        })
      );
      const admit = await admitRunAtomic(db, policy, {
        env: this.env,
        axes: {
          tier: allowance.tier,
          telegramId: typeof allowance.tgId === "number" ? allowance.tgId : null,
          browserId: btCheck.browserId,
          ipAddress: clientIp || allowance.ip,
          fingerprint: allowance.fp
        },
        clientRequestId,
        payloadHash,
        threadId: frame.threadId ?? null,
        retryAssistantMessageId,
        course,
        docId,
        questionText,
        quote
      });
      if (admit.kind === "blocked") {
        logEvent("warn", "ws_admit_blocked", {
          browserId: maskId(btCheck.browserId),
          tier: allowance.tier,
          course,
          docId,
          block: admit.block
        });
        safeSend({
          type: "error",
          code: admit.block.code,
          message: "Request blocked by quota or budget policy",
          block: admit.block,
          ...admit.block.retryAfterSec ? { retryAfterSec: admit.block.retryAfterSec } : {}
        });
        safeClose(4429, admit.block.code);
        return;
      }
      if (admit.kind === "conflict") {
        safeSend({ type: "error", code: "client_request_conflict", message: admit.message });
        safeClose(4409, "client_request_conflict");
        return;
      }
      if (admit.kind === "not_found") {
        safeSend({ type: "error", code: "thread_not_found", message: admit.message });
        safeClose(4404, "thread_not_found");
        return;
      }
      if (admit.kind === "duplicate") {
        loggedRunId = admit.runId;
        safeSend({
          type: "meta",
          threadId: admit.threadId,
          threadTitle: admit.threadTitle,
          userMessageId: admit.userMessageId,
          assistantMessageId: admit.assistantMessageId,
          runId: admit.runId,
          tier: allowance.tier,
          model: admit.model,
          degraded: { active: false }
        });
        safeSend({
          type: "done",
          runId: admit.runId,
          status: admit.status,
          text: "",
          steps: [],
          degraded: { active: false },
          block: null
        });
        safeClose(1e3, "duplicate");
        return;
      }
      loggedRunId = admit.runId;
      safeSend({
        type: "meta",
        threadId: admit.threadId,
        threadTitle: admit.threadTitle,
        userMessageId: admit.userMessageId,
        assistantMessageId: admit.assistantMessageId,
        runId: admit.runId,
        tier: allowance.tier,
        model: admit.model,
        degraded: admit.degraded
      });
      const provider = new CodexResponsesProvider(this.env, db);
      await executeAgentRun({
        env: this.env,
        db,
        provider,
        policy,
        runId: admit.runId,
        threadId: admit.threadId,
        excludeMessageIds: [admit.userMessageId, admit.assistantMessageId],
        course,
        docId,
        tier: allowance.tier,
        bucket: admit.bucket,
        model: admit.model,
        initialReserveMicros: admit.reserveMicros,
        degraded: admit.degraded,
        questionText,
        quote,
        signal,
        isStoppedByUser,
        sendFrame: safeSend
      });
      safeClose(1e3, "done");
    } catch (err) {
      safeSend({
        type: "error",
        code: "internal_error",
        message: err instanceof Error ? err.message : "Unexpected error"
      });
      safeClose(1011, "internal_error");
    } finally {
      console.log(
        JSON.stringify({
          event: "chat_run_telemetry",
          runId: loggedRunId,
          ...db.telemetry.snapshot()
        })
      );
    }
  }
};

// src/index.ts
function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
__name(getAllowedOrigin, "getAllowedOrigin");
function withCorsHeaders(headers, allowedOrigin) {
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Browser-Token, X-Session-Token"
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
__name(withCorsHeaders, "withCorsHeaders");
function jsonResponse(status, body, allowedOrigin, setCookie) {
  const headers = withCorsHeaders(
    new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }),
    allowedOrigin
  );
  if (setCookie) {
    headers.append("Set-Cookie", setCookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
__name(jsonResponse, "jsonResponse");
function extractSessionToken(request) {
  const headerTok = request.headers.get("X-Session-Token");
  if (headerTok) return headerTok.trim();
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}
__name(extractSessionToken, "extractSessionToken");
async function readBoundedJson(request, maxBytes = 32768) {
  const cl = Number(request.headers.get("Content-Length") ?? "0");
  if (cl > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
__name(readBoundedJson, "readBoundedJson");
async function handleGetThread(env, db, request, url) {
  const course = url.searchParams.get("course")?.trim() ?? "";
  const docId = url.searchParams.get("doc")?.trim() ?? "";
  const requestedThreadId = url.searchParams.get("threadId")?.trim() || null;
  const beforeUpdatedAtRaw = url.searchParams.get("beforeUpdatedAt");
  const beforeUpdatedAt = beforeUpdatedAtRaw && /^\d+$/.test(beforeUpdatedAtRaw) ? Number(beforeUpdatedAtRaw) : null;
  if (!course || !docId) {
    return { status: 400, body: { code: "missing_params", message: "course and doc are required" } };
  }
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token")
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }
  const session = await verifyActiveSession(env, db, extractSessionToken(request));
  if (!session && btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Session or browser token required" } };
  }
  const policy = await loadPolicy(db);
  const pageSize = policy.threadsPageSize;
  const threadsRes = session ? beforeUpdatedAt !== null ? await db.all(
    db.prepare(
      `SELECT id, title, updated_at
               FROM chat_threads
               WHERE telegram_id = ? AND course = ? AND doc_id = ? AND updated_at < ?
               ORDER BY updated_at DESC
               LIMIT ?`
    ).bind(session.telegramId, course, docId, beforeUpdatedAt, pageSize)
  ) : await db.all(
    db.prepare(
      `SELECT id, title, updated_at
               FROM chat_threads
               WHERE telegram_id = ? AND course = ? AND doc_id = ?
               ORDER BY updated_at DESC
               LIMIT ?`
    ).bind(session.telegramId, course, docId, pageSize)
  ) : beforeUpdatedAt !== null ? await db.all(
    db.prepare(
      `SELECT id, title, updated_at
               FROM chat_threads
               WHERE browser_id = ? AND telegram_id IS NULL AND course = ? AND doc_id = ? AND updated_at < ?
               ORDER BY updated_at DESC
               LIMIT ?`
    ).bind(btCheck.status === "ok" ? btCheck.browserId : "", course, docId, beforeUpdatedAt, pageSize)
  ) : await db.all(
    db.prepare(
      `SELECT id, title, updated_at
               FROM chat_threads
               WHERE browser_id = ? AND telegram_id IS NULL AND course = ? AND doc_id = ?
               ORDER BY updated_at DESC
               LIMIT ?`
    ).bind(btCheck.status === "ok" ? btCheck.browserId : "", course, docId, pageSize)
  );
  const threads = threadsRes.results.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updated_at
  }));
  const targetThreadId = requestedThreadId ?? threads[0]?.id ?? null;
  let thread = null;
  let requestedThreadMissing = false;
  if (targetThreadId) {
    const [thrRes, msgRes] = await db.batch([
      session ? db.prepare(
        "SELECT id, course, doc_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND telegram_id = ?"
      ).bind(targetThreadId, session.telegramId) : db.prepare(
        "SELECT id, course, doc_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND browser_id = ? AND telegram_id IS NULL"
      ).bind(targetThreadId, btCheck.status === "ok" ? btCheck.browserId : ""),
      db.prepare(
        `SELECT id, seq, role, status, content_tex, quote_json, steps_json, error_message, run_id, created_at, updated_at
           FROM chat_messages
           WHERE thread_id = ?
           ORDER BY seq DESC
           LIMIT 50`
      ).bind(targetThreadId)
    ]);
    const thrRow = thrRes?.results[0];
    if (!thrRow) {
      if (requestedThreadId) requestedThreadMissing = true;
    } else {
      const messages = [...msgRes?.results ?? []].reverse().map((m) => ({
        id: m.id,
        seq: m.seq,
        role: m.role,
        status: m.status,
        contentTex: m.content_tex,
        quote: typeof m.quote_json === "string" ? safeJsonParse(m.quote_json) : null,
        steps: typeof m.steps_json === "string" ? safeJsonParse(m.steps_json) : [],
        errorMessage: m.error_message ?? null,
        runId: m.run_id ?? null,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }));
      thread = {
        id: thrRow.id,
        course: thrRow.course,
        docId: thrRow.doc_id,
        title: thrRow.title,
        createdAt: thrRow.created_at,
        updatedAt: thrRow.updated_at,
        messages
      };
    }
  }
  const isSecure = request.url.startsWith("https://");
  return {
    status: 200,
    body: {
      threads,
      thread,
      requestedThreadMissing,
      ...btCheck.status === "ok" && btCheck.needsStorageSync ? { browserToken: btCheck.browserToken } : {}
    },
    ...btCheck.status === "ok" && btCheck.needsCookieSync ? { setCookie: makeBrowserTokenCookie(btCheck.browserToken, isSecure) } : {}
  };
}
__name(handleGetThread, "handleGetThread");
async function handleGetRunStatus(env, db, request, runId) {
  const btCheck = await resolveBrowserToken(
    env.BROWSER_TOKEN_SECRET,
    request.headers.get("Cookie"),
    request.headers.get("X-Browser-Token")
  );
  if (btCheck.status === "mismatch") {
    return { status: 409, body: { code: "browser_token_mismatch", message: "Browser token mismatch" } };
  }
  const session = await verifyActiveSession(env, db, extractSessionToken(request));
  if (!session && btCheck.status === "missing") {
    return { status: 401, body: { code: "unauthorized", message: "Session or browser token required" } };
  }
  const run = await db.first(
    db.prepare(
      "SELECT id, status, expires_at, assistant_message_id, thread_id, telegram_id, browser_id FROM usage_runs WHERE id = ?"
    ).bind(runId)
  );
  if (!run) {
    return { status: 404, body: { code: "run_not_found", message: "Run not found" } };
  }
  const ownsRun = session ? run.telegram_id === session.telegramId || run.telegram_id === null && btCheck.status === "ok" && run.browser_id === btCheck.browserId : btCheck.status === "ok" && run.telegram_id === null && run.browser_id === btCheck.browserId;
  if (!ownsRun) {
    return { status: 403, body: { code: "forbidden", message: "Not owner of run" } };
  }
  const nowMs = Date.now();
  if (run.status === "running" && run.expires_at < nowMs) {
    await sweepExpiredRuns(db, nowMs);
    return {
      status: 200,
      body: {
        runId: run.id,
        status: "error",
        expiresAt: run.expires_at,
        assistantMessageId: run.assistant_message_id,
        threadId: run.thread_id
      }
    };
  }
  return {
    status: 200,
    body: {
      runId: run.id,
      status: run.status,
      expiresAt: run.expires_at,
      assistantMessageId: run.assistant_message_id,
      threadId: run.thread_id
    }
  };
}
__name(handleGetRunStatus, "handleGetRunStatus");
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(safeJsonParse, "safeJsonParse");
var index_default = {
  async scheduled(_controller, env, ctx) {
    const stub = env.CHAT_RUNNER.get(env.CHAT_RUNNER.idFromName("daily-archiver"));
    ctx.waitUntil(stub.runDailyArchive());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = getAllowedOrigin(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCorsHeaders(new Headers(), allowedOrigin)
      });
    }
    if (url.pathname === "/v1/health" && request.method === "GET") {
      return jsonResponse(200, { ok: true, service: "hse-lecture-notes-api" }, allowedOrigin);
    }
    if (url.pathname === "/v1/messages") {
      const origin2 = request.headers.get("Origin");
      if (origin2 && !allowedOrigin) {
        return jsonResponse(403, { code: "forbidden_origin", message: "Origin not allowed" }, null);
      }
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse(426, { code: "upgrade_required", message: "Expected WebSocket upgrade" }, allowedOrigin);
      }
      const stub = env.CHAT_RUNNER.get(env.CHAT_RUNNER.newUniqueId());
      return stub.fetch(request);
    }
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigin) {
      return jsonResponse(403, { code: "forbidden_origin", message: "Origin not allowed" }, null);
    }
    const db = new TrackedD1(env.DB);
    const reqId = `req_${randomToken(8)}`;
    const reqStart = Date.now();
    const finish = /* @__PURE__ */ __name((status, body, setCookie) => {
      logEvent(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "http_request", {
        reqId,
        method: request.method,
        path: url.pathname,
        status,
        code: typeof body.code === "string" ? body.code : void 0,
        reason: typeof body.reason === "string" ? body.reason : void 0,
        durationMs: Date.now() - reqStart,
        ...db.telemetry.snapshot()
      });
      return jsonResponse(status, body, allowedOrigin, setCookie);
    }, "finish");
    try {
      if (url.pathname === "/v1/auth/nonce" && request.method === "POST") {
        const res = await handleCreateNonce(env, db, request);
        return finish(res.status, res.body, res.setCookie);
      }
      if (url.pathname === "/v1/auth/telegram" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleTelegramLogin(env, db, request, body);
        return finish(res.status, res.body, res.setCookie);
      }
      if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
        const body = await readBoundedJson(request) ?? {};
        const token = typeof body.sessionToken === "string" ? body.sessionToken : extractSessionToken(request);
        const res = await handleLogout(env, db, token);
        return finish(res.status, res.body);
      }
      if (url.pathname === "/v1/allowance" && request.method === "POST") {
        const body = await readBoundedJson(request);
        if (!body) {
          return finish(400, { code: "invalid_json", message: "Invalid JSON body" });
        }
        const res = await handleAllowance(env, db, request, {
          turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : void 0,
          sessionToken: typeof body.sessionToken === "string" ? body.sessionToken : extractSessionToken(request) ?? void 0,
          browserToken: typeof body.browserToken === "string" ? body.browserToken : void 0,
          fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : void 0
        });
        return finish(res.status, res.body, res.setCookie);
      }
      if (url.pathname === "/v1/thread" && request.method === "GET") {
        const res = await handleGetThread(env, db, request, url);
        return finish(res.status, res.body, res.setCookie);
      }
      const runStatusMatch = /^\/v1\/runs\/([a-zA-Z0-9_-]+)\/status$/.exec(url.pathname);
      if (runStatusMatch && request.method === "GET") {
        const res = await handleGetRunStatus(env, db, request, runStatusMatch[1]);
        return finish(res.status, res.body);
      }
      return finish(404, { code: "not_found", message: "Endpoint not found" });
    } catch (err) {
      logEvent("error", "http_unhandled_error", {
        reqId,
        method: request.method,
        path: url.pathname,
        durationMs: Date.now() - reqStart,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 600) : void 0,
        ...db.telemetry.snapshot()
      });
      return jsonResponse(500, { code: "internal_error", message: "Internal server error" }, allowedOrigin);
    }
  }
};
export {
  ChatRunner,
  index_default as default
};
//# sourceMappingURL=index.js.map
