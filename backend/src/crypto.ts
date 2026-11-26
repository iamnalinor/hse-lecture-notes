const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function importHmacKey(secret: string, usages: ("sign" | "verify")[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function hmacSignBase64Url(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function hmacVerifyBase64Url(
  secret: string,
  data: string,
  signatureBase64Url: string,
): Promise<boolean> {
  try {
    const key = await importHmacKey(secret, ["verify"]);
    const sigBytes = base64UrlToBytes(signatureBase64Url);
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
  } catch {
    return false;
  }
}

// =============================================================================
// Signed permanent browserToken: "<browserId>.<hmacSig>"
// =============================================================================

export async function mintBrowserToken(
  secret: string,
  browserId = randomToken(18),
): Promise<{
  browserId: string;
  browserToken: string;
}> {
  const sig = await hmacSignBase64Url(secret, browserId);
  return {
    browserId,
    browserToken: `${browserId}.${sig}`,
  };
}

export async function verifyBrowserToken(
  secret: string,
  token: string | null | undefined,
): Promise<{ browserId: string; browserToken: string } | null> {
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

// =============================================================================
// HS256 JWT sign & verify
// =============================================================================

export async function signHs256Jwt<T extends object>(secret: string, payload: T): Promise<string> {
  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigB64 = await hmacSignBase64Url(secret, signingInput);
  return `${signingInput}.${sigB64}`;
}

export async function verifyHs256Jwt<T extends { exp?: number }>(
  secret: string,
  token: string | null | undefined,
  nowMs = Date.now(),
): Promise<T | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  try {
    const header = JSON.parse(decoder.decode(base64UrlToBytes(headerB64))) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const ok = await hmacVerifyBase64Url(secret, `${headerB64}.${payloadB64}`, sigB64);
    if (!ok) return null;
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadB64))) as T;
    if (typeof payload.exp === "number" && payload.exp * 1000 <= nowMs) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// =============================================================================
// AES-256-GCM encryption for codex_credentials in D1
// =============================================================================

async function deriveAesKey(rawSecret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(rawSecret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJsonAesGcm(secret: string, data: unknown): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = encoder.encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function decryptJsonAesGcm<T>(secret: string, encoded: string): Promise<T> {
  const parts = encoded.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload format");
  }
  const key = await deriveAesKey(secret);
  const iv = base64UrlToBytes(parts[1]!);
  const ciphertext = base64UrlToBytes(parts[2]!);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext)) as T;
}

// =============================================================================
// RS256 JWKS verification (Telegram OIDC id_token)
// =============================================================================

export interface JwkKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

export interface JwksDocument {
  keys: JwkKey[];
}

export function decodeJwtUnverified<T = Record<string, unknown>>(
  token: string,
): {
  header: { alg?: string; kid?: string; typ?: string };
  payload: T;
  signingInput: string;
  signature: Uint8Array;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decoder.decode(base64UrlToBytes(parts[0]!))) as {
      alg?: string;
      kid?: string;
      typ?: string;
    };
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[1]!))) as T;
    const signature = base64UrlToBytes(parts[2]!);
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature,
    };
  } catch {
    return null;
  }
}

export async function verifyRs256JwtWithJwks<T extends Record<string, unknown>>(
  token: string,
  jwks: JwksDocument,
): Promise<T | null> {
  const parsed = decodeJwtUnverified<T>(token);
  if (!parsed || parsed.header.alg !== "RS256") return null;

  const candidates = parsed.header.kid
    ? jwks.keys.filter((k) => k.kid === parsed.header.kid)
    : jwks.keys;

  for (const jwk of candidates) {
    if (jwk.kty !== "RSA") continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        parsed.signature,
        encoder.encode(parsed.signingInput),
      );
      if (valid) return parsed.payload;
    } catch {
      // try next matching key
    }
  }
  return null;
}

// =============================================================================
// IP normalization (IPv4 as-is, IPv6 normalized to /64 prefix)
// =============================================================================

export function normalizeIpAddress(rawIp: string | null | undefined): string {
  if (!rawIp) return "0.0.0.0";
  const ip = rawIp.trim().split(",")[0]!.trim();
  if (!ip) return "0.0.0.0";
  if (!ip.includes(":")) return ip; // IPv4

  // Expand IPv6 and keep /64 prefix (first 4 hextets)
  const parts = ip.toLowerCase().split("::");
  let hextets: string[];
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = Math.max(0, 8 - (left.length + right.length));
    hextets = [...left, ...Array<string>(missing).fill("0"), ...right];
  } else {
    hextets = ip.toLowerCase().split(":");
  }
  const prefix = hextets.slice(0, 4).map((h) => h.padStart(4, "0"));
  return `${prefix.join(":")}::/64`;
}
