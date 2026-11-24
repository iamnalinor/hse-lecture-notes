import { useQueryClient } from "@tanstack/react-query";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { labelIndexQuery } from "#web/api/queries.ts";
import { paths } from "#web/domain/paths.ts";
import { findMaterialTarget } from "#web/shared/ui/dom.ts";

import { ChatComposer } from "../composer/composer.tsx";
import { SparklesIcon } from "../icons.tsx";
import { ChatLog } from "../messages/log.tsx";
import { isMaterialLink } from "../messages/markdown-parse.ts";
import { ChatRefPreview } from "../messages/ref-preview.tsx";
import { useChat } from "../session/context.tsx";
import { ChatPanelHeader } from "./parts.tsx";
import { ChatResizeHandle } from "./resize-handle.tsx";
import { useChatAutoScroll } from "./use-auto-scroll.ts";

const isMobileViewport = (): boolean => globalThis.window.matchMedia("(max-width: 720px)").matches;
const isReducedMotion = (): boolean =>
  globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const focusHeaderChatButton = (): void => {
  document.querySelector<HTMLButtonElement>(".ai-head-btn")?.focus();
};

const highlightTargetBlock = (target: Element): void => {
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

const useMaterialNavigation = (course: string) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (anchor: string): Promise<void> => {
      if (isMaterialLink(anchor)) {
        await navigate(anchor);
        return;
      }
      const origin = globalThis.location.pathname;
      const index = await client.query(labelIndexQuery);
      const label = index[course]?.[anchor];
      if (label === undefined || globalThis.location.pathname !== origin) {
        return;
      }

      await navigate(paths.lecture(course, label.weekId, anchor));
    },
    [client, course, navigate],
  );
};

const useJumpToBlock = (chat: ReturnType<typeof useChat>, onMobileBack: () => void) => {
  const { isOpen, close } = chat;
  const { course, docId } = chat.docContext;
  const documentPrefix = `${paths.lecture(course, docId)}#`;
  const openMissing = useMaterialNavigation(course);
  const pendingRef = useRef<Element | null>(null);
  useEffect(() => {
    const target = pendingRef.current;
    if (isOpen || target === null) {
      return;
    }
    const frame = globalThis.requestAnimationFrame(() => {
      pendingRef.current = null;
      highlightTargetBlock(target);
    });
    return () => {
      globalThis.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  return useCallback(
    (blockId: string): void => {
      const anchor = blockId.startsWith(documentPrefix)
        ? blockId.slice(documentPrefix.length)
        : blockId;
      const target = isMaterialLink(anchor) ? null : findMaterialTarget(anchor, docId);
      if (target === null) {
        void openMissing(anchor);
        return;
      }
      if (isMobileViewport()) {
        pendingRef.current = target;
        close();
        onMobileBack();
        return;
      }
      highlightTargetBlock(target);
    },
    [close, docId, documentPrefix, onMobileBack, openMissing],
  );
};

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

  const jumpToBlock = useJumpToBlock(chat, () => {
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
  useChatAutoScroll(scrollerRef, { messages: chat.messages, isLoading: chat.isThreadLoading });

  if (!chat.isConfigured) {
    return null;
  }

  return (
    <>
      <aside aria-label="Чат с ИИ" className="ai-panel" id="ai-panel" ref={setPanelEl}>
        <ChatResizeHandle />
        <ChatPanelHeader
          historyOpen={historyOpen}
          onClose={handleClose}
          onToggleHistory={() => {
            setHistoryOpen((prev) => !prev);
          }}
        />
        <div className="ai-scroll" ref={scrollerRef}>
          <div aria-live="polite" className="ai-log">
            <ChatLog onJumpToBlock={jumpToBlock} />
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
    </>
  );
};
