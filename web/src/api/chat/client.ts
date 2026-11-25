import {
  type ChatMessageStatus,
  type ChatThread,
  type ChatThreadSummary,
  type ChatTier,
  type ChatUser,
  parseChatSuggestion,
} from "#web/domain/chat/model.ts";

import { ensureChatAllowance } from "./access.ts";
import { apiJson, assertSameSession, getChatEnvConfig } from "./http.ts";
import {
  clearAllowanceToken,
  readStoredAuth,
  saveBrowserToken,
  saveSessionAuth,
} from "./storage.ts";
import { openTelegramLoginPopup, type TurnstileHooks } from "./widgets.ts";

export { type ChatAccess, ensureChatAllowance } from "./access.ts";
export { getChatEnvConfig, isChatConfigured } from "./http.ts";

export type ThreadResponse = {
  readonly hasMore?: boolean;
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

type HistoryCursor = Pick<ChatThreadSummary, "id" | "updatedAt">;
const threadUrl = (id?: null | string, before?: HistoryCursor, beforeSeq?: number): string => {
  const query = new URLSearchParams();
  if (id !== undefined && id !== null) {
    query.set("threadId", id);
  }
  if (before !== undefined) {
    query.set("beforeUpdatedAt", String(before.updatedAt));
    query.set("beforeId", before.id);
  }
  if (beforeSeq !== undefined) {
    query.set("beforeSeq", String(beforeSeq));
  }
  return `/v1/thread?${query}`;
};

export const fetchChatThread = async (
  threadId?: null | string,
  before?: HistoryCursor,
  beforeSeq?: number,
): Promise<null | ThreadResponse> => {
  const auth = readStoredAuth();
  if (auth.browserToken === null && auth.sessionToken === null) {
    return null;
  }
  const res = await apiJson(threadUrl(threadId, before, beforeSeq), { method: "GET" });
  if (auth.sessionToken !== readStoredAuth().sessionToken || !res.ok) {
    return null;
  }
  const data = res.data as ThreadResponse;
  return {
    ...data,
    threads: data.threads.map((thread) => ({
      ...thread,
      contextLimited: thread.contextLimited === true,
    })),
    thread:
      data.thread === null
        ? null
        : {
            ...data.thread,
            contextLimited: data.thread.contextLimited === true,
            messages: data.thread.messages.map((message) => ({
              ...message,
              suggestion: parseChatSuggestion(message.suggestion),
            })),
          },
  };
};

export const fetchChatRunStatus = async (runId: string): Promise<null | RunStatusResponse> => {
  const res = await apiJson(`/v1/runs/${encodeURIComponent(runId)}/status`, { method: "GET" });
  return res.ok ? (res.data as RunStatusResponse) : null;
};

const requestLoginNonce = async (turnstileHooks: TurnstileHooks): Promise<string> => {
  if (readStoredAuth().browserToken === null) {
    await ensureChatAllowance(turnstileHooks);
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
): Promise<{ readonly user: ChatUser; readonly tier: ChatTier }> => {
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
  return loginData;
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
