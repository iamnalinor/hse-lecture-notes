import type { JSX } from "react";

import { isChatConfigured } from "#web/api/chat/http.ts";

import { SparklesIcon } from "../icons.tsx";
import { setChatOpen, useIsChatOpen } from "../open-state.ts";
import { loadChatRuntime, prefetchChatRuntime } from "../runtime-loader.ts";

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
        if (!isOpen) {
          // Also the retry after a failure that was not shown (the chat was not wanted then).
          loadChatRuntime();
        }
        setChatOpen((open) => !open);
      }}
      onFocus={prefetchChatRuntime}
      onPointerDown={prefetchChatRuntime}
      onPointerEnter={prefetchChatRuntime}
      title="Чат с ИИ"
      type="button"
    >
      <SparklesIcon />
      <span>Чат</span>
    </button>
  );
};
