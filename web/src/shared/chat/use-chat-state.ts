import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchChatRunStatus,
  fetchChatThread,
  loginViaTelegram,
  logoutChatSession,
  type ThreadResponse,
} from "#web/api/chat-client.ts";
import { readStoredAuth, subscribeAuthStorage } from "#web/api/chat-storage.ts";
import { type TurnstileHooks, warmupChatWidgets } from "#web/api/chat-widgets.ts";
import {
  type ChatBlock,
  type ChatDegraded,
  type ChatMessage,
  type ChatTier,
  type ChatUser,
  nextRunPollDelayMs,
} from "#web/domain/chat.ts";

import { useThreadHistory } from "./use-thread-history.ts";

export const useRootOpenClassSync = (isOpen: boolean): void => {
  const savedScrollYRef = useRef<null | number>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) {
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
  }, [isOpen]);

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
    setRateLimitUntil(
      next?.code === "rate_limited" ? Date.now() + (next.retryAfterSec ?? 15) * 1000 : 0,
    );
  }, []);

  useEffect(() => {
    if (typeof block?.nextAvailableAt !== "number") {
      return;
    }
    const timer = globalThis.setTimeout(
      () => {
        applyBlock(null);
      },
      Math.max(0, block.nextAvailableAt - Date.now()),
    );
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [applyBlock, block]);

  useEffect(
    () =>
      subscribeAuthStorage(() => {
        const fresh = readStoredAuth();
        if (fresh.user?.id !== user?.id) {
          applyBlock(null);
          setDegraded({ active: false });
        }
        setTier(fresh.tier);
        setUser(fresh.user);
      }),
    [applyBlock, user?.id],
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

const readThread = async (threadId?: null | string): Promise<null | ThreadResponse> => {
  try {
    return await fetchChatThread(threadId);
  } catch {
    return null;
  }
};

export const useThreadState = (isOpen: boolean, isConfigured: boolean) => {
  const history = useThreadHistory();
  const { replacePage } = history;
  const [activeThreadId, setActiveThreadId] = useState<null | string>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(
    () => isConfigured && readStoredAuth().browserToken !== null,
  );

  const [pollRunId, setPollRunId] = useState<null | string>(null);
  const requestRef = useRef(0);
  const invalidateLoad = useCallback(() => {
    requestRef.current += 1;
    setIsThreadLoading(false);
  }, []);
  const loadThread = useCallback(
    async (requestedThreadId?: null | string): Promise<void> => {
      const request = ++requestRef.current;
      const data = await readThread(requestedThreadId);
      if (request !== requestRef.current) {
        return;
      }
      setIsThreadLoading(false);
      if (data === null) {
        return;
      }
      const items = data.thread?.messages ?? [];
      const last = items.at(-1);
      const run = last?.role === "assistant" && last.status === "running" ? last.runId : null;
      replacePage(data);
      setActiveThreadId(data.thread?.id ?? null);
      setMessages(items);
      setIsStreaming(run !== null);
      setPollRunId(run);
    },
    [replacePage],
  );

  useRunStatusPoller({ runId: pollRunId, threadId: activeThreadId, loadThread });

  const openedRef = useRef(false);
  useEffect(() => {
    if (!isOpen || !isConfigured || openedRef.current) {
      return;
    }
    openedRef.current = true;
    if (readStoredAuth().browserToken !== null) {
      // Defer the first fetch until the panel has committed its loading state.
      queueMicrotask(() => void loadThread());
    }
  }, [isConfigured, isOpen, loadThread]);

  useEffect(() => {
    if (isOpen && isConfigured) {
      warmupChatWidgets();
    }
  }, [isConfigured, isOpen]);

  return {
    activeThreadId,
    canStop: isStreaming && pollRunId === null,
    invalidateLoad,
    isStreaming,
    isThreadLoading,
    loadThread: (threadId: string) => {
      setIsThreadLoading(true);
      return loadThread(threadId);
    },
    messages,
    setActiveThreadId,
    setIsStreaming,
    setMessages,
    setPollRunId,
    ...history,
  };
};

type LoginDeps = {
  readonly onLogin: (account: ChatUser | null) => void;
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
      deps.onLogin(res.user);
      deps.setTier(res.tier);
      deps.setUser(res.user);
      deps.setDegraded(res.degraded);
      deps.setBlock(res.block);
    } catch {
      // User cancelled Telegram popup or network error
    } finally {
      setIsLoginBusy(false);
    }
  }, [deps, isLoginBusy]);

  const switchAccount = useCallback(async (): Promise<void> => {
    if ((await logoutChatSession()) === "session_changed") {
      return;
    }
    deps.setTier("guest");
    deps.setUser(null);
    deps.setDegraded({ active: false });
    deps.setBlock(null);
    await login();
  }, [deps, login]);

  return { isLoginBusy, login, switchAccount };
};

type PollTarget = {
  readonly runId: null | string;
  readonly threadId: null | string;
  readonly loadThread: (threadId: null | string) => Promise<void>;
};

const useRunStatusPoller = ({ runId, threadId, loadThread }: PollTarget): void => {
  useEffect(() => {
    if (runId === null) {
      return;
    }
    let isActive = true;
    let attempt = 0;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const tick = async (): Promise<void> => {
      if (!document.hidden) {
        try {
          const status = await fetchChatRunStatus(runId);
          if (isActive && status?.status !== "running") {
            await loadThread(threadId);
          }
        } catch {
          // A temporary connection error leaves the saved run eligible for the next poll.
        }
      }
      if (isActive) {
        timer = globalThis.setTimeout(() => void tick(), nextRunPollDelayMs(++attempt));
      }
    };
    timer = globalThis.setTimeout(() => void tick(), nextRunPollDelayMs(0));
    return () => {
      isActive = false;
      globalThis.clearTimeout(timer);
    };
  }, [loadThread, runId, threadId]);
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
