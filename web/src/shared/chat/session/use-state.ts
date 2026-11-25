import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TurnstileHooks } from "#web/api/chat/widgets.ts";
import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat/model.ts";

import { ensureChatAllowance, loginViaTelegram } from "#web/api/chat/client.ts";
import {
  readStoredAuth,
  readStoredDegraded,
  saveDegraded,
  subscribeAuthStorage,
} from "#web/api/chat/storage.ts";

export const useRootOpenClassSync = (isOpen: boolean): void => {
  const savedScrollYRef = useRef<null | { url: string; y: number }>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) {
      root.classList.add("ai-open");
      if (
        globalThis.window.matchMedia("(max-width: 720px)").matches &&
        savedScrollYRef.current === null
      ) {
        savedScrollYRef.current = { url: globalThis.location.href, y: globalThis.scrollY };
      }
      return;
    }
    root.classList.remove("ai-open");
    if (savedScrollYRef.current === null) {
      return;
    }
    const saved = savedScrollYRef.current;
    savedScrollYRef.current = null;
    if (
      saved.url === globalThis.location.href &&
      globalThis.window.matchMedia("(max-width: 720px)").matches
    ) {
      globalThis.window.scrollTo(0, saved.y);
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
    const unblockAt = block?.code === "rate_limited" ? rateLimitUntil : block?.nextAvailableAt;
    if (typeof unblockAt !== "number") {
      return;
    }
    const timer = globalThis.setTimeout(
      () => {
        applyBlock(null);
      },
      Math.max(0, unblockAt - Date.now()),
    );
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [applyBlock, block, rateLimitUntil]);

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
  readonly telegramSdk: "failed" | "loading" | "ready";
  readonly retryTelegram: () => Promise<void>;
  readonly onLogin: (account: ChatUser | null, canResume: boolean) => void;
  readonly setBlock: (next: ChatBlock | null) => void;
  readonly setDegraded: (next: ChatDegraded) => void;
  readonly setTier: (next: ChatTier) => void;
  readonly setUser: (next: ChatUser | null) => void;
  readonly turnstileHooks: TurnstileHooks;
};

export const useTelegramAuthActions = (deps: LoginDeps) => {
  const [isLoginBusy, setIsLoginBusy] = useState(false);

  const [checkingLogin, setCheckingLogin] = useState(false);
  const [verificationError, setVerificationError] = useState(false);
  const checkLogin = useCallback(async () => {
    setCheckingLogin(true);
    setVerificationError(false);
    try {
      const access = await ensureChatAllowance(deps.turnstileHooks);
      if (access.degraded !== null) {
        deps.setDegraded(access.degraded);
      }
      deps.setBlock(access.block);
    } catch {
      setVerificationError(true);
    } finally {
      setCheckingLogin(false);
    }
  }, [deps]);
  const login = useCallback(async (): Promise<void> => {
    if (isLoginBusy || checkingLogin || deps.telegramSdk === "loading") {
      return;
    }
    if (deps.telegramSdk === "failed") {
      await deps.retryTelegram();
      return;
    }
    setIsLoginBusy(true);
    try {
      const res = await loginViaTelegram(deps.turnstileHooks, () => {
        deps.setTier("guest");
        deps.setUser(null);
        deps.setDegraded({ active: false });
        deps.setBlock(null);
      });
      deps.onLogin(res.user, true);
      deps.setTier(res.tier);
      deps.setUser(res.user);
      deps.setBlock(null);
      setIsLoginBusy(false);
      await checkLogin();
    } catch {
      // User cancelled Telegram popup or network error
    } finally {
      setIsLoginBusy(false);
    }
  }, [checkingLogin, checkLogin, deps, isLoginBusy]);

  return {
    checkingLogin,
    verificationError,
    clearVerificationError: () => {
      setVerificationError(false);
    },
    isLoginBusy: isLoginBusy || checkingLogin || deps.telegramSdk === "loading",
    telegramLoadFailed: deps.telegramSdk === "failed",
    login,
    switchAccount: login,
  };
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
