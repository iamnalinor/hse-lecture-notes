import type { ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat.ts";

const KEY_BROWSER = "hse_chat_browser_token";
const KEY_SESSION = "hse_chat_session_token";
const KEY_ALLOWANCE = "hse_chat_allowance_token";
const KEY_ALLOWANCE_EXP = "hse_chat_allowance_exp";
const KEY_USER = "hse_chat_user";
const KEY_TIER = "hse_chat_tier";
const KEY_DEGRADED = "hse_chat_degraded:";

export type StoredChatAuth = {
  readonly allowanceExpiresAt: number;
  readonly allowanceToken: null | string;
  readonly browserToken: null | string;
  readonly sessionToken: null | string;
  readonly tier: ChatTier;
  readonly user: ChatUser | null;
};

const safeGet = (key: string): null | string => {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: null | string): void => {
  try {
    if (value === null) {
      globalThis.localStorage.removeItem(key);
    } else {
      globalThis.localStorage.setItem(key, value);
    }
  } catch {
    // Storage may be unavailable in strict private mode.
  }
};

export const readPageThread = (key: string): null | string => safeGet(`hse_chat_thread:${key}`);
export const savePageThread = (key: string, id: null | string): void => {
  safeSet(`hse_chat_thread:${key}`, id);
};

const parseStoredUser = (raw: null | string): ChatUser | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown };
    return typeof parsed.id === "number" && typeof parsed.name === "string"
      ? { id: parsed.id, name: parsed.name }
      : null;
  } catch {
    return null;
  }
};

const parseStoredTier = (raw: null | string): ChatTier => {
  return raw === "student" || raw === "default" || raw === "extended" ? raw : "guest";
};

export const readStoredAuth = (): StoredChatAuth => {
  const expRaw = safeGet(KEY_ALLOWANCE_EXP);
  const exp = expRaw !== null && /^\d+$/.test(expRaw) ? Number(expRaw) : 0;
  return {
    allowanceExpiresAt: exp,
    allowanceToken: safeGet(KEY_ALLOWANCE),
    browserToken: safeGet(KEY_BROWSER),
    sessionToken: safeGet(KEY_SESSION),
    tier: parseStoredTier(safeGet(KEY_TIER)),
    user: parseStoredUser(safeGet(KEY_USER)),
  };
};

export const saveBrowserToken = (token: null | string): void => {
  safeSet(KEY_BROWSER, token);
};

export const saveSessionAuth = (
  sessionToken: null | string,
  tier: ChatTier,
  user: ChatUser | null,
): void => {
  safeSet(KEY_SESSION, sessionToken);
  safeSet(KEY_TIER, tier);
  safeSet(KEY_USER, user === null ? null : JSON.stringify(user));
};

export const saveAllowanceToken = (token: null | string, expiresAt: number): void => {
  safeSet(KEY_ALLOWANCE, token);
  safeSet(KEY_ALLOWANCE_EXP, token === null ? null : String(expiresAt));
};

export const clearAllowanceToken = (): void => {
  saveAllowanceToken(null, 0);
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
  safeSet(
    key,
    degraded.active
      ? JSON.stringify({ savedAt: Date.now(), restoresAt: degraded.restoresAt })
      : null,
  );
};

/** Serializes first-time browserToken initialization across tabs via Web Locks API. */
export const withBrowserInitLock = async <T>(
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const locks = globalThis.navigator.locks as LockManager | undefined;
  const options = signal === undefined ? {} : { signal };
  return locks === undefined
    ? await work()
    : await locks.request("hse-chat-browser-token-init", options, async () => await work());
};

/** Subscribes to cross-tab `localStorage` changes so tabs stay synchronized on tokens/auth. */
export const subscribeAuthStorage = (onChange: () => void): (() => void) => {
  const watched = new Set([KEY_BROWSER, KEY_SESSION, KEY_USER, KEY_TIER]);
  const listener = (event: StorageEvent): void => {
    if (event.key === null || watched.has(event.key) || event.key.startsWith(KEY_DEGRADED)) {
      onChange();
    }
  };
  globalThis.window.addEventListener("storage", listener);
  return () => {
    globalThis.window.removeEventListener("storage", listener);
  };
};
