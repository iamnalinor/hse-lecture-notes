import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatComposer } from "./chat-composer.tsx";
import { useChat } from "./chat-context.tsx";
import { SparklesIcon } from "./chat-icons.tsx";
import { ChatMessageView } from "./chat-message-view.tsx";
import { ChatEmptyView, ChatPanelHeader, TurnstileModal } from "./chat-panel-parts.tsx";
import { ChatRefPreview } from "./chat-ref-preview.tsx";

const isMobileViewport = (): boolean => globalThis.window.matchMedia("(max-width: 720px)").matches;
const isReducedMotion = (): boolean =>
  globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const focusHeaderChatButton = (): void => {
  document.querySelector<HTMLButtonElement>(".ai-head-btn")?.focus();
};

const highlightTargetBlock = (target: HTMLElement): void => {
  const details = target.closest("details");
  if (details !== null && !details.open) {
    details.open = true;
  }
  target.scrollIntoView({ behavior: isReducedMotion() ? "auto" : "smooth", block: "center" });
  target.classList.remove("ai-flash-block");
  target.getBoundingClientRect();
  target.classList.add("ai-flash-block");
};

type EscHandlerDeps = {
  readonly cancelTurnstile: () => void;
  readonly closeHistory: () => void;
  readonly handleClose: () => void;
  readonly historyOpen: boolean;
  readonly isOpen: boolean;
  readonly turnstileOpen: boolean;
};

const usePanelEscapeKey = (deps: EscHandlerDeps): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      if (deps.turnstileOpen) {
        deps.cancelTurnstile();
      } else if (deps.historyOpen) {
        deps.closeHistory();
      } else if (deps.isOpen) {
        deps.handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deps]);
};

const useAutoScroll = (scrollerRef: { current: HTMLDivElement | null }, dep: unknown): void => {
  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 140) {
      el.scrollTo({ behavior: isReducedMotion() ? "auto" : "smooth", top: el.scrollHeight });
    }
  }, [dep, scrollerRef]);
};

const useJumpToBlock = (close: () => void, onMobileBack: () => void) =>
  useCallback(
    (blockId: string): void => {
      const target = document.querySelector<HTMLElement>(`#${CSS.escape(blockId)}`);
      if (target === null) {
        return;
      }
      if (isMobileViewport()) {
        close();
        onMobileBack();
      }
      highlightTargetBlock(target);
    },
    [close, onMobileBack],
  );

/** Exact `.ai-panel` right-side drawer + mobile `.ai-back` pill + Turnstile modal from prototype.html. */
export const ChatPanel = (): JSX.Element | null => {
  const chat = useChat();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMobileBack, setShowMobileBack] = useState(false);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const handleClose = useCallback((): void => {
    setHistoryOpen(false);
    chat.close();
    focusHeaderChatButton();
  }, [chat]);

  const jumpToBlock = useJumpToBlock(chat.close, () => {
    setShowMobileBack(true);
  });

  usePanelEscapeKey({
    cancelTurnstile: chat.cancelTurnstile,
    closeHistory: () => {
      setHistoryOpen(false);
    },
    handleClose,
    historyOpen,
    isOpen: chat.isOpen,
    turnstileOpen: chat.turnstileOpen,
  });
  useAutoScroll(scrollerRef, chat.messages);

  if (!chat.isConfigured || chat.docContext === null) {
    return null;
  }

  return (
    <>
      <aside aria-label="Чат с ИИ" className="ai-panel" id="ai-panel" ref={setPanelEl}>
        <ChatPanelHeader
          historyOpen={historyOpen}
          onClose={handleClose}
          onToggleHistory={() => {
            setHistoryOpen((prev) => !prev);
          }}
        />
        <div className="ai-scroll" ref={scrollerRef}>
          <div aria-live="polite" className="ai-log">
            {chat.messages.length === 0
              ? !chat.isThreadLoading && <ChatEmptyView />
              : chat.messages.map((message) => (
                  <ChatMessageView
                    isStreaming={chat.isStreaming}
                    key={message.id}
                    message={message}
                    onJumpToBlock={jumpToBlock}
                    onRetry={(msgId) => {
                      void chat.retryMessage(msgId);
                    }}
                  />
                ))}
          </div>
        </div>
        <ChatComposer />
      </aside>
      <ChatRefPreview onJumpToBlock={jumpToBlock} panelElement={panelEl} />
      {createPortal(
        <button
          className={showMobileBack && !chat.isOpen ? "ai-back is-on" : "ai-back"}
          onClick={() => {
            setShowMobileBack(false);
            if (!chat.isOpen) {
              chat.toggle();
            }
          }}
          type="button"
        >
          <SparklesIcon />К чату
        </button>,
        document.body,
      )}
      <TurnstileModal />
    </>
  );
};
