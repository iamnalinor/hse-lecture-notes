import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TurnstileHooks } from "#web/api/chat/widgets.ts";

import { TelegramLoginCancelled } from "#web/api/chat/abort.ts";
import { type ChatAccess, ensureChatAllowance, loginViaTelegram } from "#web/api/chat/client.ts";
import {
  readStoredAuth,
  readStoredDegraded,
  saveDegraded,
  subscribeAuthStorage,
} from "#web/api/chat/storage.ts";
import {
  type ChatBlock,
  type ChatDegraded,
  type ChatTier,
  type ChatUser,
  resolveQuestionLimit,
} from "#web/domain/chat/model.ts";

export const useChatAuthState = () => {
  const initial = useMemo(() => readStoredAuth(), []);
  const [maxQuestionChars, setMaxQuestionChars] = useState(() =>
    resolveQuestionLimit(initial.maxQuestionChars),
  );
  const setQuestionLimit = useCallback((limit: number | undefined) => {
    setMaxQuestionChars(resolveQuestionLimit(limit));
  }, []);
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
        setQuestionLimit(fresh.maxQuestionChars);
        setTier(fresh.tier);
        setUser(fresh.user);
      }),
    [applyBlock, setQuestionLimit, user?.id],
  );

  return {
    block,
    degraded,
    rateLimitUntil,
    maxQuestionChars,
    setQuestionLimit,
    setBlock: applyBlock,
    applyLogin: (account: ChatUser, nextTier: ChatTier) => {
      setDegraded(readStoredDegraded());
      setTier(nextTier);
      setUser(account);
      applyBlock(null);
    },
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
  readonly setBlock: (next: ChatBlock | null) => void;
  readonly setQuestionLimit: (limit: number | undefined) => void;
  readonly setDegraded: (next: ChatDegraded) => void;
  readonly applyLogin: (account: ChatUser, tier: ChatTier) => void;
  readonly turnstileHooks: TurnstileHooks;
};

const abortOnSessionChange = (sessionToken: null | string, controller: AbortController) =>
  subscribeAuthStorage(() => {
    if (sessionToken !== readStoredAuth().sessionToken) {
      controller.abort();
    }
  });

const applyLoginAllowance = (deps: LoginDeps, access: ChatAccess): void => {
  if (access.degraded !== null) {
    deps.setDegraded(access.degraded);
  }
  deps.setQuestionLimit(access.maxQuestionChars);
  deps.setBlock(access.block);
};

const useLoginCheck = (deps: LoginDeps) => {
  type Check = { sessionToken: null | string; status: "checking" | "error" };
  const [check, setCheck] = useState<Check | null>(null);
  const checkLogin = useCallback(async () => {
    const { sessionToken } = readStoredAuth();
    const active: Check = { sessionToken, status: "checking" };
    const controller = new AbortController();
    const unsubscribe = abortOnSessionChange(sessionToken, controller);
    setCheck(active);
    try {
      const access = await ensureChatAllowance(deps.turnstileHooks, { signal: controller.signal });
      if (sessionToken === readStoredAuth().sessionToken) {
        applyLoginAllowance(deps, access);
      }
      setCheck((prev) => (prev === active ? null : prev));
    } catch {
      const result: Check | null =
        sessionToken === readStoredAuth().sessionToken ? { sessionToken, status: "error" } : null;
      setCheck((prev) => (prev === active ? result : prev));
    } finally {
      unsubscribe();
    }
  }, [deps]);
  const status = check?.sessionToken === readStoredAuth().sessionToken ? check.status : undefined;
  return {
    checkingLogin: status === "checking",
    verificationError: status === "error",
    // Only a finished, failed check is cleared: a check still running keeps the login controls busy.
    clearVerificationError: () => {
      setCheck((prev) => (prev?.status === "error" ? null : prev));
    },
    checkLogin,
  };
};

export const useTelegramAuthActions = (deps: LoginDeps) => {
  const [attempt, setAttempt] = useState<null | {
    token: null | string;
    status: "busy" | "failed";
  }>(null);
  const isLoginBusy = attempt?.status === "busy";
  const { checkLogin, ...verification } = useLoginCheck(deps);
  const { checkingLogin } = verification;
  const login = useCallback(
    async (onLogin: (account: ChatUser) => void): Promise<void> => {
      if (isLoginBusy || checkingLogin || deps.telegramSdk === "loading") {
        return;
      }
      if (deps.telegramSdk === "failed") {
        await deps.retryTelegram();
        return;
      }
      const { sessionToken } = readStoredAuth();
      setAttempt({ token: sessionToken, status: "busy" });
      try {
        const res = await loginViaTelegram(deps.turnstileHooks);
        onLogin(res.user);
        deps.applyLogin(res.user, res.tier);
      } catch (error) {
        setAttempt(
          error instanceof TelegramLoginCancelled
            ? null
            : { token: sessionToken, status: "failed" },
        );
        return;
      }
      setAttempt(null);
      await checkLogin();
    },
    [checkingLogin, checkLogin, deps, isLoginBusy],
  );

  return {
    ...verification,
    isLoginBusy: isLoginBusy || checkingLogin || deps.telegramSdk === "loading",
    loginError: attempt?.status === "failed" && attempt.token === readStoredAuth().sessionToken,
    telegramLoadFailed: deps.telegramSdk === "failed",
    login,
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
