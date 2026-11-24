import type { TurnstileHooks } from "#web/api/chat-widgets.ts";
import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat.ts";

import { type ChatAccess, ensureChatAllowance } from "#web/api/chat-client.ts";

export type AllowanceSetters = {
  readonly setBlock: (block: ChatBlock | null) => void;
  readonly setDegraded: (degraded: ChatDegraded) => void;
  readonly setTier: (tier: ChatTier) => void;
  readonly setUser: (user: ChatUser | null) => void;
};

type AllowanceOutcome =
  | { readonly allowance: ChatAccess; readonly kind: "ok" }
  | { readonly kind: "blocked" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

const applyAccess = (setters: AllowanceSetters, allowance: ChatAccess): void => {
  setters.setTier(allowance.tier);
  setters.setUser(allowance.user);
  if (allowance.degraded !== null) {
    setters.setDegraded(allowance.degraded);
  }
};

export const fetchAllowanceOutcome = async (
  turnstileHooks: TurnstileHooks,
  setters: AllowanceSetters,
  context: {
    readonly isCurrent: () => boolean;
    readonly signal: AbortSignal;
    readonly onChecking: () => void;
    readonly onChecked: () => void;
  },
): Promise<AllowanceOutcome> => {
  try {
    const allowance = await ensureChatAllowance(turnstileHooks, context);
    if (!context.isCurrent()) {
      return { kind: "cancelled" };
    }
    applyAccess(setters, allowance);
    if (allowance.block !== null) {
      setters.setBlock(allowance.block);
      return { kind: "blocked" };
    }
    return { allowance, kind: "ok" };
  } catch (error) {
    if (
      context.signal.aborted ||
      (error instanceof Error && error.message === "Turnstile cancelled")
    ) {
      return { kind: "cancelled" };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: `Ошибка доступа (/v1/allowance): ${detail}` };
  } finally {
    context.onChecked();
  }
};
