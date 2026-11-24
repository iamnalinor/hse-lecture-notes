import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat.ts";

import { awaitWithSignal } from "./chat-abort.ts";
import { apiJson, assertSameSession, getChatEnvConfig } from "./chat-http.ts";
import {
  readStoredAuth,
  saveAllowanceToken,
  saveBrowserToken,
  saveDegraded,
  saveSessionAuth,
  withBrowserInitLock,
} from "./chat-storage.ts";
import {
  getBrowserFingerprint,
  requestTurnstileToken,
  subscribeTurnstileCancellation,
  type TurnstileHooks,
} from "./chat-widgets.ts";

export type AllowanceResponse = {
  readonly allowanceExpiresAt: number;
  readonly allowanceToken: string;
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
  await withBrowserInitLock(async () => {
    context.signal.throwIfAborted();
    assertSameSession(context.sessionToken);
    const cached = readCachedAccess();
    if (cached !== null) {
      return cached;
    }
    const res = await postAllowance(context);
    if (!res.ok) {
      throw new Error(`Allowance error (${res.status})`);
    }
    const data = res.data as AllowanceResponse;
    saveBrowserToken(data.browserToken);
    saveAllowanceToken(data.allowanceToken, data.allowanceExpiresAt);
    saveSessionAuth(context.sessionToken, data.tier, data.user);
    saveDegraded(data.degraded);
    return data;
  }, context.signal);

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
