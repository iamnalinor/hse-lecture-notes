import { type JSX, useState } from "react";

import { isChatConfigured } from "#web/api/chat/http.ts";

import { SparklesIcon } from "../icons.tsx";
import { setChatOpen, useIsChatOpen } from "../open-state.ts";
import { loadChatRuntime, prefetchChatRuntime, useChatRuntimeLoad } from "../runtime-loader.ts";
import { ChatLoadFailurePopover } from "./load-failure.tsx";

export const ChatToggleButton = (): JSX.Element | null => {
  const isOpen = useIsChatOpen();
  const load = useChatRuntimeLoad();
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  if (!isChatConfigured()) {
    return null;
  }
  const isBusy = isOpen && load.status === "loading";

  return (
    <>
      <button
        aria-busy={isBusy || undefined}
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
        ref={setButton}
        title="Чат с ИИ"
        type="button"
      >
        {isBusy ? <span aria-hidden="true" className="ai-head-spinner" /> : <SparklesIcon />}
        <span>Чат</span>
      </button>
      {isOpen && load.status === "failed" && (
        <ChatLoadFailurePopover anchor={button} failure={load.failure} />
      )}
    </>
  );
};
