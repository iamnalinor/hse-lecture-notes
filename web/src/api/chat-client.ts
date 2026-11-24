import type {
  ChatBlock,
  ChatDegraded,
  ChatMessageStatus,
  ChatThread,
  ChatThreadSummary,
  ChatTier,
  ChatUser,
} from "#web/domain/chat.ts";

import {
  clearAllowanceToken,
  readStoredAuth,
  saveAllowanceToken,
  saveBrowserToken,
  saveSessionAuth,
  withBrowserInitLock,
} from "./chat-storage.ts";
import {
  getBrowserFingerprint,
  openTelegramLoginPopup,
  requestTurnstileToken,
  type TurnstileHooks,
} from "./chat-widgets.ts";

export type ChatEnvConfig = {
  readonly apiUrl: string;
  readonly telegramClientId: string;
  readonly turnstileSiteKey: string;
};

const stripTrailingSlash = (url: string): string =>
  url.endsWith("/") ? stripTrailingSlash(url.slice(0, -1)) : url;

export const getChatEnvConfig = (): ChatEnvConfig => {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    apiUrl: stripTrailingSlash(env["VITE_CHAT_API_URL"] ?? ""),
    telegramClientId: env["VITE_TELEGRAM_CLIENT_ID"] ?? "",
    turnstileSiteKey: env["VITE_TURNSTILE_SITE_KEY"] ?? "",
  };
};

export const isChatConfigured = (): boolean => getChatEnvConfig().apiUrl !== "";

export type AllowanceResponse = {
  readonly allowanceExpiresAt: number;
  readonly allowanceToken: string;
  readonly block: ChatBlock | null;
  readonly browserToken: string;
  readonly degraded: ChatDegraded;
  readonly tier: ChatTier;
  readonly user: ChatUser | null;
};

export type ThreadResponse = {
  readonly browserToken?: string;
  readonly requestedThreadMissing: boolean;
  readonly thread: ChatThread | null;
  readonly threads: readonly ChatThreadSummary[];
};

export type RunStatusResponse = {
  readonly assistantMessageId: string;
  readonly expiresAt: number;
  readonly runId: string;
  readonly status: ChatMessageStatus;
  readonly threadId: string;
};

const buildHeaders = (extra?: Record<string, string>): Headers => {
  const auth = readStoredAuth();
  const headers = new Headers(extra);
  if (auth.browserToken !== null) {
    headers.set("X-Browser-Token", auth.browserToken);
  }
  if (auth.sessionToken !== null) {
    headers.set("X-Session-Token", auth.sessionToken);
  }
  return headers;
};

const apiJson = async (
  path: string,
  init: RequestInit,
): Promise<{ readonly data: unknown; readonly ok: boolean; readonly status: number }> => {
  const { apiUrl } = getChatEnvConfig();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: buildHeaders(init.headers as Record<string, string> | undefined),
  });
  try {
    const data: unknown = await response.json();
    return { data, ok: response.ok, status: response.status };
  } catch {
    return { data: {}, ok: response.ok, status: response.status };
  }
};

const postAllowanceOnce = async (
  turnstileToken: string,
  fingerprint: string,
): Promise<{ readonly data: AllowanceResponse; readonly ok: boolean; readonly status: number }> => {
  const auth = readStoredAuth();
  const res = await apiJson("/v1/allowance", {
    body: JSON.stringify({
      browserToken: auth.browserToken ?? undefined,
      fingerprint,
      sessionToken: auth.sessionToken ?? undefined,
      turnstileToken,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return { data: res.data as AllowanceResponse, ok: res.ok, status: res.status };
};

const assertSameSession = (sessionToken: null | string): void => {
  if (sessionToken !== readStoredAuth().sessionToken) {
    throw new Error("Chat session changed");
  }
};

/** Obtains or refreshes the 30-minute allowanceToken (with multi-tab lock & 409 mismatch recovery). */
export const ensureChatAllowance = async (
  turnstileHooks: TurnstileHooks,
  shouldForceRefresh = false,
): Promise<AllowanceResponse> => {
  const cached = readStoredAuth();
  const marginMs = 60_000;
  if (
    !shouldForceRefresh &&
    cached.allowanceToken !== null &&
    cached.browserToken !== null &&
    cached.allowanceExpiresAt > Date.now() + marginMs
  ) {
    return {
      allowanceExpiresAt: cached.allowanceExpiresAt,
      allowanceToken: cached.allowanceToken,
      block: null,
      browserToken: cached.browserToken,
      degraded: { active: false },
      tier: cached.tier,
      user: cached.user,
    };
  }

  return await withBrowserInitLock(async () => {
    const { turnstileSiteKey } = getChatEnvConfig();
    const [turnstileToken, fingerprint] = await Promise.all([
      requestTurnstileToken(turnstileSiteKey, turnstileHooks),
      getBrowserFingerprint(),
    ]);

    const post = async (token: string) => {
      assertSameSession(cached.sessionToken);
      const result = await postAllowanceOnce(token, fingerprint);
      assertSameSession(cached.sessionToken);
      return result;
    };
    let res = await post(turnstileToken);
    if (res.status === 409) {
      saveBrowserToken(null);
      const retryTs = await requestTurnstileToken(turnstileSiteKey, turnstileHooks);
      res = await post(retryTs);
    }
    if (!res.ok) {
      throw new Error(`Allowance error (${res.status})`);
    }
    saveBrowserToken(res.data.browserToken);
    saveAllowanceToken(res.data.allowanceToken, res.data.allowanceExpiresAt);
    saveSessionAuth(readStoredAuth().sessionToken, res.data.tier, res.data.user);
    return res.data;
  });
};

const buildThreadQuery = (course: string, docId: string, threadId?: null | string): string => {
  const params = new URLSearchParams({ course, doc: docId });
  if (threadId !== undefined && threadId !== null && threadId !== "") {
    params.set("threadId", threadId);
  }
  return `/v1/thread?${params.toString()}`;
};

export const fetchChatThread = async (
  course: string,
  docId: string,
  threadId?: null | string,
): Promise<null | ThreadResponse> => {
  const auth = readStoredAuth();
  if (auth.browserToken === null && auth.sessionToken === null) {
    return null;
  }
  const res = await apiJson(buildThreadQuery(course, docId, threadId), { method: "GET" });
  if (auth.sessionToken !== readStoredAuth().sessionToken) {
    return null;
  }
  if (res.status === 409) {
    saveBrowserToken(null);
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const data = res.data as ThreadResponse;
  if (typeof data.browserToken === "string" && data.browserToken !== "") {
    saveBrowserToken(data.browserToken);
  }
  return data;
};

export const fetchChatRunStatus = async (runId: string): Promise<null | RunStatusResponse> => {
  const res = await apiJson(`/v1/runs/${encodeURIComponent(runId)}/status`, { method: "GET" });
  return res.ok ? (res.data as RunStatusResponse) : null;
};

const requestLoginNonce = async (turnstileHooks: TurnstileHooks): Promise<string> => {
  if (readStoredAuth().browserToken === null) {
    await ensureChatAllowance(turnstileHooks, true);
  }
  const nonceRes = await apiJson("/v1/auth/nonce", { method: "POST" });
  const nonceData = nonceRes.data as { readonly nonce?: string };
  if (!nonceRes.ok || typeof nonceData.nonce !== "string") {
    throw new Error("Failed to obtain login nonce");
  }
  return nonceData.nonce;
};

export const loginViaTelegram = async (
  turnstileHooks: TurnstileHooks,
): Promise<AllowanceResponse> => {
  const { sessionToken } = readStoredAuth();
  const nonce = await requestLoginNonce(turnstileHooks);
  const idToken = await openTelegramLoginPopup(getChatEnvConfig().telegramClientId, nonce);
  assertSameSession(sessionToken);
  const loginRes = await apiJson("/v1/auth/telegram", {
    body: JSON.stringify({ telegramIdToken: idToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assertSameSession(sessionToken);
  if (!loginRes.ok) {
    throw new Error("Telegram login rejected by server");
  }
  const loginData = loginRes.data as {
    readonly browserToken: string;
    readonly sessionToken: string;
    readonly tier: ChatTier;
    readonly user: ChatUser;
  };
  saveBrowserToken(loginData.browserToken);
  saveSessionAuth(loginData.sessionToken, loginData.tier, loginData.user);
  clearAllowanceToken();
  return await ensureChatAllowance(turnstileHooks, true);
};

export const logoutChatSession = async (): Promise<"logged_out" | "session_changed"> => {
  const auth = readStoredAuth();
  if (auth.sessionToken !== null) {
    try {
      await apiJson("/v1/auth/logout", {
        body: JSON.stringify({ sessionToken: auth.sessionToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } catch {
      // Clear local session regardless of network failure
    }
  }
  if (auth.sessionToken !== readStoredAuth().sessionToken) {
    return "session_changed";
  }
  saveSessionAuth(null, "guest", null);
  clearAllowanceToken();
  return "logged_out";
};
