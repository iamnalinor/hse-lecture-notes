import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchChatRunStatus,
  fetchChatThread,
  loginViaTelegram,
  logoutChatSession,
} from "#web/api/chat-client.ts";
import { readStoredAuth, subscribeAuthStorage } from "#web/api/chat-storage.ts";
import { type TurnstileHooks, warmupChatWidgets } from "#web/api/chat-widgets.ts";
import {
  type ChatBlock,
  type ChatDegraded,
  type ChatDocContext,
  type ChatMessage,
  type ChatThreadSummary,
  type ChatTier,
  type ChatUser,
  nextRunPollDelayMs,
} from "#web/domain/chat.ts";

export const useRootOpenClassSync = (isOpen: boolean, hasDoc: boolean): void => {
  const savedScrollYRef = useRef<null | number>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen && hasDoc) {
      root.classList.add("ai-open");
      if (
        globalThis.window.matchMedia("(max-width: 720px)").matches &&
        savedScrollYRef.current === null
      ) {
        savedScrollYRef.current = globalThis.window.scrollY;
      }
      return;
    }
    root.classList.remove("ai-open");
    if (savedScrollYRef.current === null) {
      return;
    }
    const y = savedScrollYRef.current;
    savedScrollYRef.current = null;
    if (globalThis.window.matchMedia("(max-width: 720px)").matches) {
      globalThis.window.scrollTo(0, y);
    }
  }, [hasDoc, isOpen]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove("ai-open");
    },
    [],
  );
};

export const useChatAuthState = () => {
  const initial = useMemo(() => readStoredAuth(), []);
  const [tier, setTier] = useState<ChatTier>(initial.tier);
  const [user, setUser] = useState<ChatUser | null>(initial.user);
  const [degraded, setDegraded] = useState<ChatDegraded>({ active: false });
  const [block, setBlock] = useState<ChatBlock | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState(0);

  const applyBlock = useCallback((next: ChatBlock | null): void => {
    setBlock(next);
    if (next?.code === "rate_limited") {
      setRateLimitUntil(Date.now() + (next.retryAfterSec ?? 15) * 1000);
    } else if (next === null) {
      setRateLimitUntil(0);
    }
  }, []);

  useEffect(
    () =>
      subscribeAuthStorage(() => {
        const fresh = readStoredAuth();
        setTier(fresh.tier);
        setUser(fresh.user);
      }),
    [],
  );

  return {
    block,
    degraded,
    rateLimitUntil,
    setBlock: applyBlock,
    setDegraded,
    setTier,
    setUser,
    tier,
    user,
  };
};

export const useThreadState = (
  docContext: ChatDocContext | null,
  isOpen: boolean,
  isConfigured: boolean,
) => {
  const [threads, setThreads] = useState<readonly ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<null | string>(null);
  const [previousThreadId, setPreviousThreadId] = useState<null | string>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(
    () => isConfigured && docContext !== null && readStoredAuth().browserToken !== null,
  );

  const loadThread = useCallback(
    async (ctx: ChatDocContext, requestedThreadId?: null | string): Promise<void> => {
      try {
        const data = await fetchChatThread(ctx.course, ctx.docId, requestedThreadId);
        if (data === null) {
          return;
        }
        setThreads(data.threads);
        if (data.thread === null) {
          setActiveThreadId(null);
          setMessages([]);
          return;
        }
        setActiveThreadId(data.thread.id);
        setMessages(data.thread.messages);
        const last = data.thread.messages.at(-1);
        if (last?.role === "assistant" && last.status === "running" && last.runId !== null) {
          setIsStreaming(true);
        }
      } finally {
        setIsThreadLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isConfigured || docContext === null || readStoredAuth().browserToken === null) {
      return;
    }
    let isCancelled = false;
    const sync = async (): Promise<void> => {
      if (!isCancelled) {
        await loadThread(docContext);
      }
    };
    void sync();
    return () => {
      isCancelled = true;
    };
  }, [docContext, isConfigured, loadThread]);

  useEffect(() => {
    if (isOpen && isConfigured && docContext !== null) {
      warmupChatWidgets();
    }
  }, [docContext, isConfigured, isOpen]);

  return {
    activeThreadId,
    isStreaming,
    isThreadLoading,
    loadThread,
    messages,
    previousThreadId,
    setActiveThreadId,
    setIsStreaming,
    setMessages,
    setPreviousThreadId,
    setThreads,
    threads,
  };
};

type LoginDeps = {
  readonly activeThreadId: null | string;
  readonly docContext: ChatDocContext | null;
  readonly loadThread: (ctx: ChatDocContext, requestedThreadId?: null | string) => Promise<void>;
  readonly setBlock: (next: ChatBlock | null) => void;
  readonly setDegraded: (next: ChatDegraded) => void;
  readonly setTier: (next: ChatTier) => void;
  readonly setUser: (next: ChatUser | null) => void;
  readonly turnstileHooks: TurnstileHooks;
};

export const useTelegramAuthActions = (deps: LoginDeps) => {
  const [isLoginBusy, setIsLoginBusy] = useState(false);

  const login = useCallback(async (): Promise<void> => {
    if (isLoginBusy) {
      return;
    }
    setIsLoginBusy(true);
    try {
      const res = await loginViaTelegram(deps.turnstileHooks);
      deps.setTier(res.tier);
      deps.setUser(res.user);
      deps.setDegraded(res.degraded);
      deps.setBlock(res.block);
      if (deps.docContext !== null) {
        await deps.loadThread(deps.docContext, deps.activeThreadId);
      }
    } catch {
      // User cancelled Telegram popup or network error
    } finally {
      setIsLoginBusy(false);
    }
  }, [deps, isLoginBusy]);

  const switchAccount = useCallback(async (): Promise<void> => {
    await logoutChatSession();
    deps.setTier("guest");
    deps.setUser(null);
    deps.setBlock(null);
    await login();
  }, [deps, login]);

  return { isLoginBusy, login, switchAccount };
};

type PollerSetters = {
  readonly loadThread: (ctx: ChatDocContext, threadId?: null | string) => Promise<void>;
  readonly setIsStreaming: (isStreaming: boolean) => void;
};

export const useRunStatusPoller = (
  setters: PollerSetters,
  runIdRef: { current: null | string },
) => {
  const timerRef = useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);

  const stopPolling = useCallback((): void => {
    if (timerRef.current === null) {
      return;
    }
    globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopPolling();
    },
    [stopPolling],
  );

  return useCallback(
    (runId: string, ctx: ChatDocContext, threadId: null | string): void => {
      stopPolling();
      let attempt = 0;
      const schedule = (delayMs: number): void => {
        timerRef.current = globalThis.setTimeout(() => {
          void tick();
        }, delayMs);
      };
      const tick = async (): Promise<void> => {
        if (document.hidden) {
          schedule(4000);
          return;
        }
        attempt += 1;
        const status = await fetchChatRunStatus(runId);
        if (status?.status !== "running") {
          stopPolling();
          setters.setIsStreaming(false);
          await setters.loadThread(ctx, threadId ?? status?.threadId ?? null);
          return;
        }
        schedule(nextRunPollDelayMs(attempt));
      };
      if (runIdRef.current !== null) {
        schedule(nextRunPollDelayMs(0));
      }
    },
    [runIdRef, setters, stopPolling],
  );
};

export const useCopyFeedback = () => {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copyText = useCallback(async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    if (timerRef.current !== null) {
      globalThis.clearTimeout(timerRef.current);
    }
    timerRef.current = globalThis.setTimeout(() => {
      setIsCopied(false);
    }, 1800);
  }, []);

  return { copyText, isCopied };
};
