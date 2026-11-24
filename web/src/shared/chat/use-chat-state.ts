import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TurnstileHooks } from "#web/api/chat-widgets.ts";
import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat.ts";

import { loginViaTelegram, logoutChatSession } from "#web/api/chat-client.ts";
import {
  readStoredAuth,
  readStoredDegraded,
  saveDegraded,
  subscribeAuthStorage,
} from "#web/api/chat-storage.ts";

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
  const [degraded, setDegraded] = useState<ChatDegraded>(readStoredDegraded);
  const [block, setBlock] = useState<ChatBlock | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const applyDegraded = useCallback((next: ChatDegraded): void => {
    saveDegraded(next);
    setDegraded(next);
  }, []);

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
        }
        setDegraded(readStoredDegraded());
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
    setDegraded: applyDegraded,
    setTier,
    setUser,
    tier,
    user,
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
      if (res.degraded !== null) {
        deps.setDegraded(res.degraded);
      }
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
