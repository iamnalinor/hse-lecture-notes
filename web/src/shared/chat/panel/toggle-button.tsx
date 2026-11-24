import type { JSX } from "react";

import { SparklesIcon } from "../icons.tsx";
import { useChat } from "../session/context.tsx";

export const ChatToggleButton = (): JSX.Element | null => {
  const chat = useChat();
  if (!chat.isConfigured) {
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
