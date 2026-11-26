import { z } from "zod";

import type { ChatDegraded } from "#web/domain/chat/model.ts";

import { TierSchema, UserSchema } from "./response-schemas.ts";

const KEY_AUTH = "hse_chat_auth";
const KEY_BROWSER = "hse_chat_browser_token";
const KEY_SESSION = "hse_chat_session_token";
const KEY_ALLOWANCE = "hse_chat_allowance_token";
const KEY_ALLOWANCE_EXP = "hse_chat_allowance_exp";
const KEY_USER = "hse_chat_user";
const KEY_TIER = "hse_chat_tier";
const KEY_DEGRADED = "hse_chat_degraded:";

const AuthSchema = z.object({
  browserToken: z.string().nullable(),
  sessionToken: z.string().nullable(),
  tier: z.union([TierSchema, z.literal("guest")]),
  user: UserSchema.nullable(),
  allowanceExpiresAt: z.number(),
  allowanceToken: z.string().nullable(),
  maxQuestionChars: z.number().int().positive().optional().catch(undefined),
});
export type StoredChatAuth = z.infer<typeof AuthSchema>;

// Keep this tab usable when storage access is denied or a write exceeds the quota.
const cachedValues = new Map<string, string>();
const failedWrites = new Set<string>();

const remember = (key: string, value: null | string): void => {
  if (value === null) {
    cachedValues.delete(key);
  } else {
    cachedValues.set(key, value);
  }
};

globalThis.addEventListener("storage", (event) => {
  if (event.key === null) {
    cachedValues.clear();
    failedWrites.clear();
  } else if (event.key.startsWith("hse_chat_")) {
    remember(event.key, event.newValue);
    failedWrites.delete(event.key);
  }
});

const safeGet = (key: string): null | string => {
  if (!failedWrites.has(key)) {
    try {
      remember(key, globalThis.localStorage.getItem(key));
    } catch {
      // The last value seen in this tab remains available.
    }
  }
  return cachedValues.get(key) ?? null;
};

const writeValue = (key: string, value: null | string): "memory" | "stored" => {
  remember(key, value);
  try {
    if (value === null) {
      globalThis.localStorage.removeItem(key);
    } else {
      globalThis.localStorage.setItem(key, value);
    }
    failedWrites.delete(key);
    return "stored";
  } catch {
    failedWrites.add(key);
    return "memory";
  }
};

/**
The account's last conversation: «Чат» opens it on every page (owner's decision, 26.11.2026). Before that
the last thread was kept per page; the home page's one (`<owner>:/`) is taken over once.
*/
export const readPageThread = (key: string): null | string =>
  safeGet(`hse_chat_thread:${key}`) ?? safeGet(`hse_chat_thread:${key}:/`);
export const savePageThread = (key: string, id: null | string): void => {
  writeValue(`hse_chat_thread:${key}`, id);
  // Any write, «no thread» included, supersedes the old key: otherwise a new chat would fall back to it.
  writeValue(`hse_chat_thread:${key}:/`, null);
};

const parseJson = (raw: null | string): unknown => {
  try {
    return JSON.parse(raw ?? "null") as unknown;
  } catch {
    return null;
  }
};

// The server handles signature verification. This marker only identifies the retired cache format.
const isCurrentLegacySession = (token: string): boolean => {
  try {
    const payload = token.split(".", 2)[1] ?? "";
    const claims = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))) as {
      typ?: unknown;
    };
    return claims.typ === "session_v2";
  } catch {
    return false;
  }
};

const guestAuth = (browserToken: null | string): StoredChatAuth => ({
  browserToken,
  sessionToken: null,
  tier: "guest",
  user: null,
  allowanceToken: null,
  allowanceExpiresAt: 0,
});

const readLegacyAuth = (): StoredChatAuth => {
  const browserToken = safeGet(KEY_BROWSER);
  const sessionToken = safeGet(KEY_SESSION);
  if (sessionToken !== null && !isCurrentLegacySession(sessionToken)) {
    return guestAuth(browserToken);
  }
  const expRaw = safeGet(KEY_ALLOWANCE_EXP);
  return {
    allowanceExpiresAt: expRaw !== null && /^\d+$/.test(expRaw) ? Number(expRaw) : 0,
    allowanceToken: safeGet(KEY_ALLOWANCE),
    browserToken,
    sessionToken,
    tier: TierSchema.safeParse(safeGet(KEY_TIER)).data ?? "guest",
    user: UserSchema.safeParse(parseJson(safeGet(KEY_USER))).data ?? null,
  };
};

export const readStoredAuth = (): StoredChatAuth => {
  const raw = safeGet(KEY_AUTH);
  return raw === null
    ? readLegacyAuth()
    : (AuthSchema.safeParse(parseJson(raw)).data ?? guestAuth(null));
};

const writeStoredAuth = (auth: StoredChatAuth): void => {
  if (writeValue(KEY_AUTH, JSON.stringify(auth)) === "memory") {
    return;
  }
  for (const key of [
    KEY_SESSION,
    KEY_BROWSER,
    KEY_USER,
    KEY_TIER,
    KEY_ALLOWANCE,
    KEY_ALLOWANCE_EXP,
  ]) {
    writeValue(key, null);
  }
};

export const assertSameSession = (sessionToken: null | string): void => {
  if (sessionToken !== readStoredAuth().sessionToken) {
    throw new Error("Chat session changed");
  }
};

export const withChatLock = async <T>(
  scope: "auth-update" | "browser-token-init" | "telegram-login",
  work: () => Promise<T> | T,
  signal?: AbortSignal,
): Promise<T> => {
  const locks = globalThis.navigator.locks as LockManager | undefined;
  const options = signal === undefined ? {} : { signal };
  return locks === undefined
    ? await work()
    : await locks.request(`hse-chat-${scope}`, options, work);
};

export const replaceChatAuth = async (
  sessionToken: null | string,
  auth: StoredChatAuth,
): Promise<void> => {
  await withChatLock("auth-update", () => {
    assertSameSession(sessionToken);
    writeStoredAuth(auth);
    if (sessionToken !== null && auth.sessionToken === null) {
      globalThis.window.dispatchEvent(new Event("hse-chat-session-expired"));
    }
  });
};

export const invalidateAllowance = async (rejectedToken: string): Promise<void> => {
  await withChatLock("auth-update", () => {
    const auth = readStoredAuth();
    if (auth.allowanceToken === rejectedToken) {
      writeStoredAuth({
        ...auth,
        allowanceToken: null,
        allowanceExpiresAt: 0,
      });
    }
  });
};

/** Keeps already known quota information available before the next message is sent. */
export const readStoredDegraded = (): ChatDegraded => {
  try {
    const key = `${KEY_DEGRADED}${readStoredAuth().user?.id ?? "guest"}`;
    const cached = JSON.parse(safeGet(key) ?? "null") as null | {
      savedAt?: number;
      restoresAt?: number;
    };
    if (cached === null || typeof cached.savedAt !== "number") {
      return { active: false };
    }
    const expiresAt =
      typeof cached.restoresAt === "number" ? cached.restoresAt : cached.savedAt + 1_800_000;
    if (expiresAt <= Date.now()) {
      return { active: false };
    }
    return typeof cached.restoresAt === "number"
      ? { active: true, restoresAt: cached.restoresAt }
      : { active: true };
  } catch {
    return { active: false };
  }
};

export const saveDegraded = (degraded: ChatDegraded): void => {
  const key = `${KEY_DEGRADED}${readStoredAuth().user?.id ?? "guest"}`;
  writeValue(
    key,
    degraded.active
      ? JSON.stringify({ savedAt: Date.now(), restoresAt: degraded.restoresAt })
      : null,
  );
};

/** Subscribes to cross-tab `localStorage` changes so tabs stay synchronized on tokens/auth. */
export const subscribeAuthStorage = (onChange: () => void): (() => void) => {
  const watched = new Set([KEY_AUTH, KEY_BROWSER, KEY_SESSION, KEY_USER, KEY_TIER]);
  const listener = (event: StorageEvent): void => {
    if (event.key === null || watched.has(event.key) || event.key.startsWith(KEY_DEGRADED)) {
      onChange();
    }
  };
  globalThis.window.addEventListener("storage", listener);
  globalThis.window.addEventListener("hse-chat-session-expired", onChange);
  return () => {
    globalThis.window.removeEventListener("storage", listener);
    globalThis.window.removeEventListener("hse-chat-session-expired", onChange);
  };
};
