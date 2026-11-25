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
  document.querySelector<HTMLButtonElement>(".ai-head-btn")?.focus({ preventScroll: true });
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

const useJumpToBlock = (chat: ReturnType<typeof useChat>, onMobileBack: () => void) => {
  const { isOpen, close } = chat;
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
          close();
          onMobileBack();
        }
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
    [close, docId, documentPrefix, onMobileBack, hasNavigated],
  );
};

const useMobileFocus = (isOpen: boolean, panelEl: HTMLElement | null): void => {
  useEffect(() => {
    if (panelEl === null || !isOpen) {
      return;
    }
    const media = globalThis.matchMedia("(max-width: 720px)");
    const root = document.querySelector<HTMLElement>("#root");
    const sync = () => {
      if (root !== null) {
        root.inert = media.matches;
      }
      if (media.matches && !panelEl.contains(document.activeElement)) {
        panelEl.focus();
      }
    };
    const cycle = (event: KeyboardEvent) => {
      if (!media.matches || event.key !== "Tab" || event.defaultPrevented) {
        return;
      }
      const controls = [
        ...panelEl.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea, input, [tabindex="0"]',
        ),
      ].filter((el) => el.checkVisibility({ visibilityProperty: true }));
      const first = controls.at(0);
      const last = controls.at(-1);
      const [edge, next] = event.shiftKey ? [first, last] : [last, first];
      if (edge?.matches(":focus") !== true) {
        return;
      }

      event.preventDefault();
      next?.focus();
    };
    sync();
    panelEl.addEventListener("keydown", cycle);
    media.addEventListener("change", sync);
    return () => {
      panelEl.removeEventListener("keydown", cycle);
      media.removeEventListener("change", sync);
      if (root !== null) {
        root.inert = false;
      }
      if (media.matches) {
        focusHeaderChatButton();
      }
    };
  }, [isOpen, panelEl]);
};

/** Exact `.ai-panel` right-side drawer + mobile `.ai-back` pill + Turnstile modal from prototype.html. */
export const ChatPanel = (): JSX.Element | null => {
  const chat = useChat();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMobileBack, setShowMobileBack] = useState(false);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useMobileFocus(chat.isOpen, panelEl);
  const handleClose = useCallback((): void => {
    setHistoryOpen(false);
    chat.close();
    focusHeaderChatButton();
  }, [chat]);

  const jumpToBlock = useJumpToBlock(chat, () => {
    setShowMobileBack(true);
  });

  usePanelEscapeKey({
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
      {createPortal(
        <aside
          aria-label="Чат с ИИ"
          className="ai-panel"
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
              <ChatLog onJumpToBlock={jumpToBlock} />
            </div>
          </div>
          <ChatComposer />
        </aside>,
        document.body,
      )}
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
