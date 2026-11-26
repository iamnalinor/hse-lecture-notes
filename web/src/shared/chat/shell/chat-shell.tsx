import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { ChatLoadFailure } from "./load-failure.ts";

import { CloseIcon, SparklesIcon } from "../icons.tsx";
import { setChatOpen } from "../open-state.ts";
import { focusHeaderChatButton, useMobileFocus } from "../panel/use-mobile-focus.ts";
import { loadChatRuntime } from "../runtime-loader.ts";
import { restoreStoredChatWidth } from "../stored-width.ts";
import { useRootOpenClassSync } from "../use-root-open-class.ts";
import { ChatLoadError } from "./chat-load-error.tsx";
import { ChatMessagesSkeleton } from "./chat-skeleton.tsx";

const isPhone = (): boolean => globalThis.matchMedia("(max-width: 720px)").matches;

const close = (): void => {
  setChatOpen(false);
  if (!isPhone()) {
    focusHeaderChatButton();
  }
};

/**
The panel in the main bundle: it opens on the click while the chat code downloads, in the frame
(`chat-frame.css`) the real panel uses, so the real one takes its place without a jump.
`failure` is `null` while the download is under way.
*/
export const ChatShell = ({
  failure,
}: {
  readonly failure: ChatLoadFailure | null;
}): JSX.Element => {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useRootOpenClassSync(true);
  useMobileFocus(true, panel);
  useEffect(() => {
    restoreStoredChatWidth();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return createPortal(
    <aside
      aria-busy={failure === null}
      aria-label="Чат с ИИ"
      className="ai-panel ai-panel-shell"
      id="ai-panel"
      ref={setPanel}
      tabIndex={-1}
    >
      <div className="ai-top">
        <div className="ai-title">
          <SparklesIcon />
          <span>Чат</span>
        </div>
        <button
          aria-label="Закрыть чат"
          className="ai-icon-btn"
          onClick={close}
          title="Закрыть (Esc)"
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="ai-scroll">
        {failure === null ? (
          <ChatMessagesSkeleton />
        ) : (
          <ChatLoadError
            failure={failure}
            onRetry={() => {
              loadChatRuntime();
              panel?.focus();
            }}
          />
        )}
      </div>
      <div className="ai-bottom">
        <div aria-hidden="true" className="ai-composer ai-sk-composer" />
      </div>
    </aside>,
    document.body,
  );
};
