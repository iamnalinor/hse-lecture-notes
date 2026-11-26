import { useQueryClient } from "@tanstack/react-query";
import { type AnimationEvent, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { labelIndexQuery } from "#web/api/queries.ts";
import { paths } from "#web/domain/paths.ts";
import { findMaterialTarget, openTargetDetails } from "#web/shared/ui/dom.ts";

import { ChatComposer } from "../composer/composer.tsx";
import { SparklesIcon } from "../icons.tsx";
import { ChatLog } from "../messages/log.tsx";
import { isMaterialLink } from "../messages/markdown-parse.ts";
import { ChatRefPreview } from "../messages/ref-preview.tsx";
import { entranceStyle } from "../open-state.ts";
import { useChat } from "../session/context.tsx";
import { ChatPanelHeader } from "./parts.tsx";
import { ChatResizeHandle } from "./resize-handle.tsx";
import { useChatAutoScroll } from "./use-auto-scroll.ts";
import { focusHeaderChatButton, type FocusOrigin, useMobileFocus } from "./use-mobile-focus.ts";

const isMobileViewport = (): boolean => globalThis.window.matchMedia("(max-width: 720px)").matches;
const isReducedMotion = (): boolean =>
  globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const highlightTargetBlock = (target: Element): void => {
  openTargetDetails(target);
  target.scrollIntoView({ behavior: isReducedMotion() ? "auto" : "smooth", block: "center" });
  target.classList.remove("ai-flash-block");
  target.getBoundingClientRect();
  target.classList.add("ai-flash-block");
};

type EscHandlerDeps = {
  readonly closeHistory: () => void;
  readonly handleClose: () => void;
  readonly historyOpen: boolean;
  readonly isOpen: boolean;
  readonly turnstileOpen: boolean;
};

const usePanelEscapeKey = (deps: EscHandlerDeps): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        deps.turnstileOpen ||
        document.querySelector("dialog[open]") !== null
      ) {
        return;
      }
      if (deps.historyOpen) {
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
    async (anchor: string): Promise<boolean> => {
      if (isMaterialLink(anchor)) {
        await navigate(anchor);
        return true;
      }
      const origin = globalThis.location.pathname;
      const index = await client.query(labelIndexQuery);
      const label = index[course]?.[anchor];
      if (label === undefined || globalThis.location.pathname !== origin) {
        return false;
      }

      await navigate(paths.lecture(course, label.weekId, anchor));
      return true;
    },
    [client, course, navigate],
  );
};

const useJumpToBlock = (chat: ReturnType<typeof useChat>) => {
  const { isOpen, closeForSource } = chat;
  const { course, docId } = chat.docContext;
  const documentPrefix = `${paths.lecture(course, docId)}#`;
  const hasNavigated = useMaterialNavigation(course);
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
    async (blockId: string): Promise<void> => {
      const anchor = blockId.startsWith(documentPrefix)
        ? blockId.slice(documentPrefix.length)
        : blockId;
      const target = isMaterialLink(anchor) ? null : findMaterialTarget(anchor, docId);
      if (target === null) {
        if ((await hasNavigated(anchor)) && isMobileViewport()) {
          closeForSource();
        }
        return;
      }
      if (isMobileViewport()) {
        pendingRef.current = target;
        closeForSource();
        return;
      }
      highlightTargetBlock(target);
    },
    [docId, documentPrefix, closeForSource, hasNavigated],
  );
};

const SourceReturnButton = ({
  isVisible,
  onReturn,
}: {
  readonly isVisible: boolean;
  readonly onReturn: () => void;
}) =>
  createPortal(
    <button className={isVisible ? "ai-back is-on" : "ai-back"} onClick={onReturn} type="button">
      <SparklesIcon />К чату
    </button>,
    document.body,
  );

/** Back from a source the chat opened: the panel reopens at the scroll position it had. */
const returnFromSource = (chat: ReturnType<typeof useChat>, restore: () => void): void => {
  chat.returnFromSource();
  globalThis.requestAnimationFrame(restore);
};

/** Props of a panel that mounts mid-opening (`entranceStyle`); dropped once played, as the keyframes would
override the closing transition. */
const usePanelEntrance = (isOpen: boolean) => {
  const [style, setStyle] = useState(entranceStyle);
  // Closed mid-entrance (Esc right after opening): drop the keyframes now, so the closing transition runs at once.
  if (!isOpen && style !== null) {
    setStyle(null);
  }
  return {
    className: style === null ? "ai-panel" : "ai-panel ai-panel-enter",
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) {
        setStyle(null);
      }
    },
    style: style ?? undefined,
  };
};

/** Exact `.ai-panel` right-side drawer + mobile `.ai-back` pill + Turnstile modal from prototype.html. */
export const ChatPanel = ({
  takeSelectionOrigin,
}: {
  readonly takeSelectionOrigin?: FocusOrigin;
}): JSX.Element | null => {
  const chat = useChat();
  const [historyOpen, setHistoryOpen] = useState(false);
  const sourceScrollRef = useRef(0);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const entrance = usePanelEntrance(chat.isOpen);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useMobileFocus(chat.isOpen, panelEl, takeSelectionOrigin);
  const handleClose = useCallback((): void => {
    setHistoryOpen(false);
    chat.close();
    if (!isMobileViewport()) {
      focusHeaderChatButton();
    }
  }, [chat]);
  const jumpToBlock = useJumpToBlock(chat);
  const followSource = (blockId: string) => {
    sourceScrollRef.current = scrollerRef.current?.scrollTop ?? 0;
    return jumpToBlock(blockId);
  };

  usePanelEscapeKey({
    closeHistory: () => {
      setHistoryOpen(false);
    },
    handleClose,
    historyOpen,
    isOpen: chat.isOpen,
    turnstileOpen: chat.turnstileOpen,
  });
  const restorePosition = useChatAutoScroll(scrollerRef, {
    messages: chat.messages,
    isLoading: chat.isThreadLoading,
  });

  if (!chat.isConfigured) {
    return null;
  }

  return (
    <>
      {createPortal(
        <aside
          aria-label="Чат с ИИ"
          {...entrance}
          id="ai-panel"
          inert={!chat.isOpen}
          ref={setPanelEl}
          tabIndex={-1}
        >
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
              <ChatLog onJumpToBlock={followSource} />
            </div>
          </div>
          <ChatComposer />
        </aside>,
        document.body,
      )}
      <ChatRefPreview onJumpToBlock={followSource} panelElement={panelEl} />
      <SourceReturnButton
        isVisible={chat.readingSource && !chat.isOpen}
        onReturn={() => {
          returnFromSource(chat, () => {
            restorePosition(sourceScrollRef.current);
          });
        }}
      />
    </>
  );
};
