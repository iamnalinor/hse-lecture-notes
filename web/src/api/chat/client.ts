import {
  type ChatMessageStatus,
  type ChatThread,
  type ChatThreadSummary,
  type ChatTier,
  type ChatUser,
  parseChatSuggestion,
} from "#web/domain/chat/model.ts";

import { ensureChatAllowance } from "./access.ts";
import { apiJson, describeApiFailure, getChatEnvConfig } from "./http.ts";
import {
  assertSameSession,
  readStoredAuth,
  replaceChatAuth,
  TelegramSessionSchema,
  withChatLock,
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

const getLoginToken = async (hooks: TurnstileHooks, requiresBrowser: boolean): Promise<string> => {
  const controller = new AbortController();
  try {
    const [idToken] = await Promise.all([
      openTelegramLoginPopup(getChatEnvConfig().telegramClientId),
      requiresBrowser && ensureChatAllowance(hooks, { signal: controller.signal }),
    ]);
    return idToken;
  } finally {
    controller.abort();
  }
};

export const loginViaTelegram = async (
  turnstileHooks: TurnstileHooks,
): Promise<{ readonly user: ChatUser; readonly tier: ChatTier }> => {
  const { browserToken, sessionToken } = readStoredAuth();
  const idToken = await getLoginToken(turnstileHooks, browserToken === null);
  return await withChatLock("telegram-login", async () => {
    assertSameSession(sessionToken);
    const res = await apiJson(
      "/v1/auth/telegram",
      {
        body: JSON.stringify({ telegramIdToken: idToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      { shouldSendSession: false },
    );
    if (!res.ok) {
      throw new Error(describeApiFailure(res));
    }
    const session = TelegramSessionSchema.parse(res.data);
    await replaceChatAuth(sessionToken, {
      ...session,
      allowanceToken: null,
      allowanceExpiresAt: 0,
    });
    return session;
  });
};
