import { useEffect, useMemo, useState } from "react";

import { getChatEnvConfig, isChatConfigured } from "#web/api/chat/client.ts";
import { loadTelegramSdk, type TurnstileHooks, warmupChatWidgets } from "#web/api/chat/widgets.ts";

import { TURNSTILE_HOST_ID } from "../panel/turnstile-modal.tsx";

const sdkStatus = async () => {
  try {
    await loadTelegramSdk();
    return "ready" as const;
  } catch {
    return "failed" as const;
  }
};

export const useTurnstile = (isOpen: boolean) => {
  const [turnstileOpen, setTurnstileOpen] = useState(false);
  const [telegramSdk, setTelegramSdk] = useState<"failed" | "loading" | "ready">("loading");
  const retryTelegram = async () => {
    setTelegramSdk("loading");
    setTelegramSdk(await sdkStatus());
  };
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
    if (!(isOpen && isChatConfigured())) {
      return;
    }

    let isActive = true;
    const prepare = async () => {
      const status = await sdkStatus();
      if (isActive) {
        setTelegramSdk(status);
      }
    };
    void prepare();
    warmupChatWidgets(getChatEnvConfig().turnstileSiteKey, turnstileHooks);
    return () => {
      isActive = false;
    };
  }, [isOpen, turnstileHooks]);
  return { turnstileHooks, turnstileOpen, telegramSdk, retryTelegram };
};
