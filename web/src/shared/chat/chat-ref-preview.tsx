import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type RefCardState = {
  readonly bodyHtml: string;
  readonly heading: string;
  readonly id: string;
  readonly left: number;
  readonly subtitle: string;
  readonly tone: string;
  readonly top: number;
  readonly width: number;
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

const computePosition = (
  anchor: HTMLElement,
): { readonly left: number; readonly top: number; readonly width: number } => {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(430, globalThis.window.innerWidth - 24);
  const estHeight = 220;
  let top = rect.bottom + 8;
  if (top + estHeight > globalThis.window.innerHeight - 12 && rect.top - estHeight - 8 >= 12) {
    top = rect.top - estHeight - 8;
  }
  return {
    left: Math.round(Math.max(12, Math.min(rect.left, globalThis.window.innerWidth - width - 12))),
    top: Math.round(Math.max(12, Math.min(top, globalThis.window.innerHeight - estHeight - 12))),
    width,
  };
};

const useRefHoverListener = (
  panelElement: HTMLElement | null,
  onCardChange: (next: null | RefCardState) => void,
): void => {
  useEffect(() => {
    if (panelElement === null) {
      return;
    }
    let openTimer: null | ReturnType<typeof globalThis.setTimeout> = null;
    let closeTimer: null | ReturnType<typeof globalThis.setTimeout> = null;

    const clearTimers = (): void => {
      if (openTimer !== null) {
        globalThis.clearTimeout(openTimer);
        openTimer = null;
      }
      if (closeTimer === null) {
        return;
      }

      globalThis.clearTimeout(closeTimer);
      closeTimer = null;
    };

    const onOver = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") {
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
          onCardChange({ ...preview, ...computePosition(anchor), id: refId });
        }
      }, 180);
    };

    const onOut = (event: PointerEvent): void => {
      if (
        event.pointerType !== "mouse" ||
        (event.target as HTMLElement | null)?.closest("[data-ref]") === null
      ) {
        return;
      }
      clearTimers();
      closeTimer = globalThis.setTimeout(() => {
        onCardChange(null);
      }, 140);
    };

    panelElement.addEventListener("pointerover", onOver);
    panelElement.addEventListener("pointerout", onOut);
    return () => {
      clearTimers();
      panelElement.removeEventListener("pointerover", onOver);
      panelElement.removeEventListener("pointerout", onOut);
    };
  }, [onCardChange, panelElement]);
};

type Props = {
  readonly onJumpToBlock: (blockId: string) => void;
  readonly panelElement: HTMLElement | null;
};

/** Exact `.ai-ref-card` hover preview for block links inside the chat panel. */
export const ChatRefPreview = ({ onJumpToBlock, panelElement }: Props): JSX.Element | null => {
  const [card, setCard] = useState<null | RefCardState>(null);
  useRefHoverListener(panelElement, setCard);

  if (card === null) {
    return null;
  }

  return createPortal(
    <div
      className="ai-ref-card is-on"
      onClick={() => {
        onJumpToBlock(card.id);
        setCard(null);
      }}
      onKeyDown={undefined}
      role="tooltip"
      style={{ left: `${card.left}px`, top: `${card.top}px`, width: `${card.width}px` }}
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
