import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type RefCardState = {
  readonly bodyHtml: string;
  readonly heading: string;
  readonly id: string;
  readonly anchor: HTMLElement;
  readonly subtitle: string;
  readonly tone: string;
};

const KIND_TONES: Readonly<Record<string, string>> = {
  Задача: "var(--prob)",
  Замечание: "var(--muted)",
  Лемма: "var(--thm)",
  Определение: "var(--def)",
  Пример: "var(--ex)",
  Следствие: "var(--thm)",
  Теорема: "var(--thm)",
  Утверждение: "var(--thm)",
};

const clonePreviewBody = (el: HTMLElement): string => {
  let kids = [...el.children];
  if (kids[0]?.querySelector("b.font-semibold") !== null) {
    kids = kids.slice(1);
  }
  const single = kids.length === 1 ? kids[0] : undefined;
  if (single?.tagName === "DIV" && !single.classList.contains("math-display")) {
    kids = [...single.children];
  }
  return kids
    .filter((child) => !/^(?:H[1-6]|DETAILS)$/.test(child.tagName))
    .slice(0, 3)
    .map((block) => {
      const clone = block.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      for (const node of clone.querySelectorAll("[id]")) {
        node.removeAttribute("id");
      }
      return clone.outerHTML;
    })
    .join("");
};

const readHeadingMeta = (
  el: HTMLElement,
  id: string,
): { readonly heading: string; readonly subtitle: string; readonly tone: string } => {
  const headingEl = el.querySelector<HTMLElement>("b.font-semibold");
  const heading = headingEl?.textContent.trim() ?? el.dataset["blockLabel"] ?? id;
  const firstWord = heading.split(" ", 1)[0] ?? "";
  const tone = KIND_TONES[firstWord] ?? "var(--ink)";
  const subtitle = headingEl?.nextElementSibling?.textContent.trim() ?? "";
  return { heading, subtitle, tone };
};

const extractDomBlockPreview = (
  id: string,
): null | {
  readonly bodyHtml: string;
  readonly heading: string;
  readonly subtitle: string;
  readonly tone: string;
} => {
  const el = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  if (el === null) {
    return null;
  }
  const bodyHtml = clonePreviewBody(el);
  return bodyHtml === "" ? null : { bodyHtml, ...readHeadingMeta(el, id) };
};

const useRefHoverListener = (
  panelElement: HTMLElement | null,
  onCardChange: (next: null | RefCardState) => void,
) => {
  const closeTimerRef = useRef<null | ReturnType<typeof globalThis.setTimeout>>(null);
  const hold = useCallback(() => {
    if (closeTimerRef.current !== null) {
      globalThis.clearTimeout(closeTimerRef.current);
    }
  }, []);
  const leave = useCallback(() => {
    hold();
    closeTimerRef.current = globalThis.setTimeout(() => {
      onCardChange(null);
    }, 140);
  }, [hold, onCardChange]);
  useEffect(() => {
    if (panelElement === null) {
      return;
    }
    let openTimer: null | ReturnType<typeof globalThis.setTimeout> = null;

    const clearTimers = (): void => {
      if (openTimer !== null) {
        globalThis.clearTimeout(openTimer);
        openTimer = null;
      }
      hold();
    };

    const onOver = (event: FocusEvent | PointerEvent): void => {
      if ("pointerType" in event && event.pointerType !== "mouse") {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-ref]");
      const refId = anchor?.dataset["ref"];
      if (anchor === null || anchor === undefined || refId === undefined || refId === "") {
        return;
      }
      clearTimers();
      openTimer = globalThis.setTimeout(() => {
        const preview = extractDomBlockPreview(refId);
        if (preview !== null) {
          onCardChange({ ...preview, anchor, id: refId });
        }
      }, 180);
    };

    const onOut = (event: FocusEvent | PointerEvent): void => {
      if (
        ("pointerType" in event && event.pointerType !== "mouse") ||
        (event.target as HTMLElement | null)?.closest("[data-ref]") === null
      ) {
        return;
      }
      clearTimers();
      leave();
    };

    panelElement.addEventListener("focusin", onOver);
    panelElement.addEventListener("focusout", onOut);
    panelElement.addEventListener("pointerover", onOver);
    panelElement.addEventListener("pointerout", onOut);
    return () => {
      clearTimers();
      panelElement.removeEventListener("focusin", onOver);
      panelElement.removeEventListener("focusout", onOut);
      panelElement.removeEventListener("pointerover", onOver);
      panelElement.removeEventListener("pointerout", onOut);
    };
  }, [hold, leave, onCardChange, panelElement]);
  return { onPointerEnter: hold, onPointerLeave: leave };
};

const usePreviewFocus = (card: null | RefCardState, close: (card: null) => void): void => {
  useEffect(() => {
    if (card === null) {
      return;
    }
    card.anchor.setAttribute("aria-describedby", "chat-ref-preview");
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.stopPropagation();
      close(null);
    };
    document.addEventListener("keydown", onEscape, { capture: true });
    return () => {
      card.anchor.removeAttribute("aria-describedby");
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [card, close]);
};

type Props = {
  readonly onJumpToBlock: (blockId: string) => void;
  readonly panelElement: HTMLElement | null;
};

/** Exact `.ai-ref-card` hover preview for block links inside the chat panel. */
export const ChatRefPreview = ({ onJumpToBlock, panelElement }: Props): JSX.Element | null => {
  const [card, setCard] = useState<null | RefCardState>(null);
  usePreviewFocus(card, setCard);
  const hover = useRefHoverListener(panelElement, setCard);
  const [floating, setFloating] = useState<HTMLElement | null>(null);
  const { floatingStyles, placement } = useFloating({
    elements: { floating, reference: card?.anchor ?? null },
    placement: "bottom-start",
    transform: false,
    strategy: "fixed",
    middleware: [offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });

  if (card === null) {
    return null;
  }

  return createPortal(
    <div
      className="ai-ref-card is-on"
      data-preview-side={placement.split("-", 1)[0]}
      id="chat-ref-preview"
      onClick={() => {
        onJumpToBlock(card.id);
        setCard(null);
      }}
      onKeyDown={undefined}
      ref={setFloating}
      role="tooltip"
      style={floatingStyles}
      {...hover}
    >
      <div className="ai-ref-head" style={{ color: card.tone }}>
        <b>{card.heading}</b>
        {card.subtitle !== "" && <span>{card.subtitle}</span>}
      </div>
      {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- cloned DOM preview from site fragment */}
      <div className="ai-ref-body is-clipped" dangerouslySetInnerHTML={{ __html: card.bodyHtml }} />
      <div className="ai-ref-foot">
        <span>Конспект</span>
        <span className="ai-ref-go">Перейти →</span>
      </div>
    </div>,
    document.body,
  );
};
