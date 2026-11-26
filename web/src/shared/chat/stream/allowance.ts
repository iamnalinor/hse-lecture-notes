import type { TurnstileHooks } from "#web/api/chat/widgets.ts";
import type { ChatBlock, ChatDegraded, ChatTier, ChatUser } from "#web/domain/chat/model.ts";

import { type ChatAccess, ensureChatAllowance } from "#web/api/chat/client.ts";
import { TurnstileError } from "#web/api/chat/turnstile.ts";

export type AllowanceSetters = {
  readonly setQuestionLimit: (limit: number | undefined) => void;
  readonly setBlock: (block: ChatBlock | null) => void;
  readonly setDegraded: (degraded: ChatDegraded) => void;
  readonly setTier: (tier: ChatTier) => void;
  readonly setUser: (user: ChatUser | null) => void;
};

export type AllowanceOutcome =
  | { readonly allowance: ChatAccess; readonly kind: "ok" }
  | { readonly kind: "blocked" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

const applyAccess = (setters: AllowanceSetters, allowance: ChatAccess): void => {
  setters.setQuestionLimit(allowance.maxQuestionChars);
  setters.setTier(allowance.tier);
  setters.setUser(allowance.user);
  if (allowance.degraded !== null) {
    setters.setDegraded(allowance.degraded);
  }
};

const describeAllowanceError = (error: unknown): string => {
  if (error instanceof TurnstileError) {
    const code = error.code === null ? "" : ` (код Cloudflare ${error.code})`;
    return `Не удалось проверить браузер${code}. Повтори через минуту; если не поможет, отключи блокировщик рекламы или смени сеть (VPN, мобильный интернет).`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `Ошибка доступа к чату: ${detail}`;
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
    return context.signal.aborted ||
      (error instanceof Error && error.message === "Turnstile cancelled")
      ? { kind: "cancelled" }
      : { kind: "error", message: describeAllowanceError(error) };
  } finally {
    context.onChecked();
  }
};
