import { useEffect, useMemo, useState } from "react";

import { getChatEnvConfig, isChatConfigured } from "#web/api/chat/client.ts";
import { type TurnstileHooks, warmupChatWidgets } from "#web/api/chat/widgets.ts";

import { TURNSTILE_HOST_ID } from "../panel/turnstile-modal.tsx";

export const useTurnstile = (isOpen: boolean) => {
  const [turnstileOpen, setTurnstileOpen] = useState(false);
  const turnstileHooks = useMemo<TurnstileHooks>(
    () => ({
      getContainer: () => document.querySelector<HTMLElement>(`#${TURNSTILE_HOST_ID}`),
      onInteractiveClose: () => {
        setTurnstileOpen(false);
      },
      onInteractiveOpen: () => {
        setTurnstileOpen(true);
      },
    }),
    [],
  );
  useEffect(() => {
    if (isOpen && isChatConfigured()) {
      warmupChatWidgets(getChatEnvConfig().turnstileSiteKey, turnstileHooks);
    }
  }, [isOpen, turnstileHooks]);
  return { turnstileHooks, turnstileOpen };
};
