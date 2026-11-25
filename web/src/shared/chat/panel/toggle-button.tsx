import type { JSX } from "react";

import { isChatConfigured } from "#web/api/chat/http.ts";

import { SparklesIcon } from "../icons.tsx";
import { setChatOpen, useIsChatOpen } from "../open-state.ts";

export const ChatToggleButton = (): JSX.Element | null => {
  const isOpen = useIsChatOpen();
  if (!isChatConfigured()) {
    return null;
  }

  return (
    <button
      aria-controls="ai-panel"
      aria-expanded={isOpen}
      className="ai-head-btn"
      onClick={() => {
        setChatOpen((open) => !open);
      }}
      title="Чат с ИИ"
      type="button"
    >
      <SparklesIcon />
      <span>Чат</span>
    </button>
  );
};
