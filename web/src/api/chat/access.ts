import {
  type ChatBlock,
  type ChatDegraded,
  type ChatTier,
  type ChatUser,
  resolveQuestionLimit,
} from "#web/domain/chat/model.ts";

import { awaitWithSignal } from "./abort.ts";
import { apiJson, describeApiFailure, getChatEnvConfig } from "./http.ts";
import { parseAllowanceResponse } from "./response-schemas.ts";
import {
  assertSameSession,
  readStoredAuth,
  replaceChatAuth,
  saveDegraded,
  withChatLock,
} from "./storage.ts";
import {
  getBrowserFingerprint,
  requestTurnstileToken,
  subscribeTurnstileCancellation,
  type TurnstileHooks,
} from "./widgets.ts";

export type AllowanceResponse = {
  readonly allowanceExpiresAt: number;
  readonly allowanceToken: string;
  readonly maxQuestionChars?: number | undefined;
  readonly block: ChatBlock | null;
  readonly browserToken: string;
  readonly degraded: ChatDegraded;
  readonly tier: ChatTier;
  readonly user: ChatUser | null;
};

export type ChatAccess = Omit<AllowanceResponse, "degraded"> & {
  readonly degraded: ChatDegraded | null;
};

const readCachedAccess = (): ChatAccess | null => {
  const cached = readStoredAuth();
  if (
    cached.allowanceToken === null ||
    cached.browserToken === null ||
    cached.allowanceExpiresAt <= Date.now() + 60_000
  ) {
    return null;
  }
  return {
    allowanceExpiresAt: cached.allowanceExpiresAt,
    allowanceToken: cached.allowanceToken,
    maxQuestionChars: cached.maxQuestionChars,
    block: null,
    browserToken: cached.browserToken,
    degraded: null,
    tier: cached.tier,
    user: cached.user,
  };
};

type AccessContext = {
  readonly hooks: TurnstileHooks;
  readonly sessionToken: null | string;
  readonly signal: AbortSignal;
};

const postAllowance = async (context: AccessContext) => {
  const verification = Promise.all([
    requestTurnstileToken(getChatEnvConfig().turnstileSiteKey, context.hooks, context.signal),
    getBrowserFingerprint(),
  ]);
  const [token, fingerprint] = await awaitWithSignal(verification, context.signal);
  context.signal.throwIfAborted();
  assertSameSession(context.sessionToken);
  const auth = readStoredAuth();
  const res = await apiJson("/v1/allowance", {
    body: JSON.stringify({
      browserToken: auth.browserToken ?? undefined,
      fingerprint,
      sessionToken: auth.sessionToken ?? undefined,
      turnstileToken: token,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: context.signal,
  });
  context.signal.throwIfAborted();
  assertSameSession(context.sessionToken);
  return res;
};

const refreshAllowance = async (context: AccessContext): Promise<ChatAccess> =>
  await withChatLock(
    "browser-token-init",
    async () => {
      context.signal.throwIfAborted();
      assertSameSession(context.sessionToken);
      const cached = readCachedAccess();
      if (cached !== null) {
        return cached;
      }
      const res = await postAllowance(context);
      if (!res.ok) {
        throw new Error(describeApiFailure(res));
      }
      const data = parseAllowanceResponse(res.data);
      const maxQuestionChars = resolveQuestionLimit(
        data.maxQuestionChars,
        readStoredAuth().maxQuestionChars,
      );
      await replaceChatAuth(context.sessionToken, {
        sessionToken: data.user === null ? null : context.sessionToken,
        browserToken: data.browserToken,
        tier: data.tier,
        user: data.user,
        allowanceToken: data.allowanceToken,
        maxQuestionChars,
        allowanceExpiresAt: data.allowanceExpiresAt,
      });
      assertSameSession(context.sessionToken);
      saveDegraded(data.degraded);
      return { ...data, maxQuestionChars };
    },
    context.signal,
  );

type PendingAllowance = {
  readonly controller: AbortController;
  readonly promise: Promise<ChatAccess>;
  readonly sessionToken: null | string;
  readonly consumers: Set<symbol>;
};
const inFlight: { value: null | PendingAllowance } = { value: null };

const startAllowance = (hooks: TurnstileHooks, sessionToken: null | string): PendingAllowance => {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    controller.abort(new Error("Browser verification timed out"));
  }, 120_000);
  const unsubscribe = subscribeTurnstileCancellation(() => {
    controller.abort(new Error("Turnstile cancelled"));
  });
  const promise = finishAllowance({ hooks, sessionToken, signal: controller.signal }, () => {
    globalThis.clearTimeout(timer);
    unsubscribe();
  });
  return { controller, promise, sessionToken, consumers: new Set() };
};

const finishAllowance = async (
  context: AccessContext,
  cleanup: () => void,
): Promise<ChatAccess> => {
  try {
    return await awaitWithSignal(refreshAllowance(context), context.signal);
  } finally {
    cleanup();
  }
};

const acquireAllowance = (hooks: TurnstileHooks): PendingAllowance => {
  const { sessionToken } = readStoredAuth();
  const pending = inFlight.value;
  const shared =
    pending !== null && pending.sessionToken === sessionToken && !pending.controller.signal.aborted
      ? pending
      : startAllowance(hooks, sessionToken);
  inFlight.value = shared;
  return shared;
};

const releaseAllowance = (shared: PendingAllowance): void => {
  if (shared.consumers.size > 0) {
    return;
  }

  shared.controller.abort(new Error("Turnstile cancelled"));
  if (inFlight.value === shared) {
    inFlight.value = null;
  }
};

/** Coalesces callers in this tab, then checks the cache again under the cross-tab lock. */
export const ensureChatAllowance = async (
  hooks: TurnstileHooks,
  options: { readonly signal?: AbortSignal; readonly onChecking?: () => void } = {},
): Promise<ChatAccess> => {
  options.signal?.throwIfAborted();
  const cached = readCachedAccess();
  if (cached !== null) {
    return cached;
  }
  options.onChecking?.();
  const shared = acquireAllowance(hooks);
  const consumer = Symbol();
  shared.consumers.add(consumer);
  try {
    return await awaitWithSignal(shared.promise, options.signal ?? shared.controller.signal);
  } finally {
    shared.consumers.delete(consumer);
    releaseAllowance(shared);
  }
};
