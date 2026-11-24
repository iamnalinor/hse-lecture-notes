import type { TurnstileHooks } from "#web/api/chat-widgets.ts";
import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat.ts";

import { type AllowanceResponse, ensureChatAllowance } from "#web/api/chat-client.ts";

export type AllowanceSetters = {
  readonly setBlock: (block: ChatBlock | null) => void;
  readonly setDegraded: (degraded: ChatDegraded) => void;
  readonly setTier: (tier: ChatTier) => void;
  readonly setUser: (user: ChatUser | null) => void;
};

type AllowanceOutcome =
  | { readonly allowance: AllowanceResponse; readonly kind: "ok" }
  | { readonly kind: "blocked" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

export const fetchAllowanceOutcome = async (
  turnstileHooks: TurnstileHooks,
  setters: AllowanceSetters,
  isCurrent: () => boolean,
): Promise<AllowanceOutcome> => {
  try {
    const allowance = await ensureChatAllowance(turnstileHooks);
    if (!isCurrent()) {
      return { kind: "cancelled" };
    }
    setters.setTier(allowance.tier);
    setters.setUser(allowance.user);
    setters.setDegraded(allowance.degraded);
    if (allowance.block !== null) {
      setters.setBlock(allowance.block);
      return { kind: "blocked" };
    }
    return { allowance, kind: "ok" };
  } catch (error) {
    if (error instanceof Error && error.message === "Turnstile cancelled") {
      return { kind: "cancelled" };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: `Ошибка доступа (/v1/allowance): ${detail}` };
  }
};
