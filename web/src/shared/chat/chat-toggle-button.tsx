import type { JSX } from "react";

import { useChat } from "./chat-context.tsx";
import { SparklesIcon } from "./chat-icons.tsx";

/** Exact `.ai-head-btn` from prototype.html placed in TopBar on document pages. */
export const ChatToggleButton = (): JSX.Element | null => {
  const chat = useChat();
  if (!chat.isConfigured || chat.docContext === null) {
    return null;
  }

  return (
    <button
      aria-controls="ai-panel"
      aria-expanded={chat.isOpen}
      className="ai-head-btn"
      onClick={chat.toggle}
      title="Чат с ИИ"
      type="button"
    >
      <SparklesIcon />
      <span>Чат</span>
    </button>
  );
};
