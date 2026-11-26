import { type JSX, useEffect, useState } from "react";

import type { ChatQuote } from "#web/domain/chat/model.ts";

import { SparklesIcon } from "../icons.tsx";
import { useChat } from "../session/context.tsx";
import { watchSelectionEnd } from "./events.ts";
import { selectParagraphOnTripleClick } from "./paragraph.ts";

const nodeToElement = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement;

const expandToMath = (range: Range): Range => {
  const cloned = range.cloneRange();
  const k1 = nodeToElement(cloned.startContainer)?.closest(".math-inline, .math-display, .katex");
  const k2 = nodeToElement(cloned.endContainer)?.closest(".math-inline, .math-display, .katex");
  if (k1 !== null && k1 !== undefined) {
    cloned.setStartBefore(k1);
  }
  if (k2 !== null && k2 !== undefined) {
    cloned.setEndAfter(k2);
  }
  return cloned;
};

const rangeToTeX = (range: Range): string => {
  const frag = range.cloneContents();
  for (const mathNode of frag.querySelectorAll(".math-inline, .math-display, .katex")) {
    const ann = mathNode.querySelector("annotation");
    const src = ann?.textContent.trim() ?? mathNode.textContent.trim();
    if (src === "") {
      continue;
    }
    const isDisplay =
      mathNode.classList.contains("math-display") || mathNode.closest(".katex-display") !== null;
    mathNode.replaceWith(document.createTextNode(isDisplay ? ` $${src}$ ` : `$${src}$`));
  }
  for (const noise of frag.querySelectorAll(
    'a[href^="#"]:not(.ref), .sr-only, summary, .ai-code-head',
  )) {
    noise.remove();
  }
  for (const block of frag.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, pre, .ai-math")) {
    block.append(" ");
  }
  return frag.textContent.replaceAll(/\s+/g, " ").trim();
};

const readLabelledSource = (
  el: Element | null,
): null | { readonly blockId?: string; readonly label: string } => {
  const labelled = el?.closest<HTMLElement>("[data-block-label]");
  const blockLabel = labelled?.dataset["blockLabel"] ?? "";
  if (labelled === null || labelled === undefined || blockLabel === "") {
    return null;
  }
  return labelled.id === "" ? { label: blockLabel } : { blockId: labelled.id, label: blockLabel };
};

const sourceOfRange = (range: Range): { readonly blockId?: string; readonly label: string } => {
  const el = nodeToElement(range.startContainer);
  const direct = readLabelledSource(el);
  if (direct !== null) {
    return direct;
  }
  const sec = el?.closest<HTMLElement>("section[id], [id]");
  const rawHeading = sec?.querySelector("h2, h3, h4, b.font-semibold")?.textContent.trim() ?? "";
  const heading = rawHeading.replaceAll(/\s+/g, " ").replace(/^([\d.]+)([^\s.\d])/, "$1 $2");
  const label = heading === "" ? "Фрагмент конспекта" : heading;
  const secId = sec?.id ?? "";
  return secId === "" ? { label } : { blockId: secId, label };
};

type FloatingPill = {
  readonly left: number;
  readonly translate: string;
  readonly quote: ChatQuote;
  readonly range: Range;
  readonly top: number;
};

const getSelectionRange = (): null | Range => {
  const sel = globalThis.window.getSelection();
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  return range.toString().trim().length >= 2 ? range : null;
};

const computePillCoords = (
  rects: readonly DOMRect[],
  isInChat: boolean,
): null | Pick<FloatingPill, "left" | "top" | "translate"> => {
  const anchorRect = rects.at(-1);
  if (anchorRect === undefined) {
    return null;
  }
  const isMobile = globalThis.window.innerWidth <= 720;
  const isChatOpen = document.documentElement.classList.contains("ai-open");
  const viewportW = globalThis.window.innerWidth;
  const maxRight =
    (!isInChat && isChatOpen && !isMobile
      ? (document.querySelector("#ai-panel")?.getBoundingClientRect().left ?? viewportW)
      : viewportW) - 8;
  const anchor = anchorRect.right;
  // Translation percentages are relative to the rendered button, including its icon and text.
  const translate = `clamp(${8 - anchor}px, -50%, calc(${maxRight - anchor}px - 100%))`;
  let top = anchorRect.bottom + (isMobile ? 34 : 8);
  if (top + 36 > globalThis.window.innerHeight - 8 && rects[0] !== undefined) {
    top = rects[0].top - 40;
  }
  return {
    left: anchor + globalThis.window.scrollX,
    translate,
    top: Math.max(8, top) + globalThis.window.scrollY,
  };
};

const selectedSource = (range: Range, canQuoteMaterial: boolean, canQuoteAnswer: boolean) => {
  const container = nodeToElement(range.commonAncestorContainer);
  if (container === null) {
    return null;
  }
  const answer = container.closest(".ai-answer");
  if (answer !== null) {
    const messageId = answer.closest<HTMLElement>("[data-answer-id]")?.dataset["answerId"];
    return !canQuoteAnswer || messageId === undefined || container.closest(".ai-code-head") !== null
      ? null
      : { messageId, label: "Ответ ассистента" };
  }
  return canQuoteMaterial && container.closest(".prose-notes") !== null
    ? sourceOfRange(range)
    : null;
};

const computeSelPill = (
  canQuoteMaterial: boolean,
  canQuoteAnswer: boolean,
): FloatingPill | null => {
  const range = getSelectionRange();
  if (range === null) {
    return null;
  }
  const source = selectedSource(range, canQuoteMaterial, canQuoteAnswer);
  if (source === null) {
    return null;
  }
  const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  const coords = computePillCoords(rects, "messageId" in source);
  if (coords === null) {
    return null;
  }
  const expanded = expandToMath(range);
  const tex = rangeToTeX(expanded);
  return tex.length < 2 || tex.length > 3500
    ? null
    : { ...coords, quote: { ...source, tex }, range: expanded };
};

const highlightQuoteRange = (range: null | Range): void => {
  const cssApi = CSS as unknown as { highlights?: Map<string, unknown> };
  if (cssApi.highlights === undefined) {
    return;
  }
  if (range === null || typeof Highlight !== "function") {
    cssApi.highlights.delete("ai-quote");
    return;
  }
  cssApi.highlights.set("ai-quote", new Highlight(range));
};

const useSelectionUpdates = (
  {
    isActive,
    canQuoteMaterial,
    canQuoteAnswer,
  }: {
    readonly isActive: boolean;
    readonly canQuoteMaterial: boolean;
    readonly canQuoteAnswer: boolean;
  },
  setPill: (pill: FloatingPill | null) => void,
): void => {
  useEffect(() => {
    if (!isActive) {
      return;
    }
    return watchSelectionEnd(
      () => {
        if (globalThis.document.activeElement?.classList.contains("ai-sel-btn") !== true) {
          setPill(computeSelPill(canQuoteMaterial, canQuoteAnswer));
        }
      },
      () => {
        setPill(null);
      },
    );
  }, [isActive, canQuoteMaterial, canQuoteAnswer, setPill]);
};

/** Exact `.ai-sel-btn` floating button from prototype.html when selecting text in notes. */
export const SelectionAskButton = ({
  onOpenFromSelection,
}: {
  readonly onOpenFromSelection?: (target: HTMLElement | null) => void;
}): JSX.Element | null => {
  const chat = useChat();
  const [pill, setPill] = useState<FloatingPill | null>(null);
  const canQuoteMaterial = chat.docContext.docId !== "";
  const canQuoteAnswer = chat.isOpen && !chat.isThreadLoading && chat.activeThreadId !== null;
  const isActive = chat.isConfigured && (canQuoteMaterial || canQuoteAnswer);

  useSelectionUpdates({ isActive, canQuoteMaterial, canQuoteAnswer }, setPill);

  useEffect(() => {
    document.addEventListener("mousedown", selectParagraphOnTripleClick, { capture: true });
    return () => {
      document.removeEventListener("mousedown", selectParagraphOnTripleClick, true);
    };
  }, []);

  useEffect(() => {
    if (chat.quote === null) {
      highlightQuoteRange(null);
    }
  }, [chat.quote]);

  const isAllowed = pill?.quote.messageId === undefined ? canQuoteMaterial : canQuoteAnswer;
  if (!isActive || !isAllowed || pill === null) {
    return null;
  }

  return (
    <SelectionPill
      onSelect={(selected) => {
        if (!chat.isOpen) {
          const start = nodeToElement(selected.range.startContainer);
          onOpenFromSelection?.(
            start?.closest<HTMLElement>(
              "p, li, dt, dd, td, th, h1, h2, h3, h4, h5, h6, section, .prose-notes",
            ) ?? null,
          );
        }
        highlightQuoteRange(selected.range);
        chat.openWithQuote(selected.quote);
        setPill(null);
        globalThis.window.getSelection()?.removeAllRanges();
      }}
      pill={pill}
    />
  );
};

const SelectionPill = ({
  pill,
  onSelect,
}: {
  readonly pill: FloatingPill;
  readonly onSelect: (selected: FloatingPill) => void;
}): JSX.Element => {
  const isReplying = pill.quote.messageId !== undefined;
  return (
    <button
      aria-label={
        isReplying ? "Ответить на выделенный фрагмент" : "Спросить в чате о выделенном фрагменте"
      }
      className="ai-sel-btn is-on"
      onClick={() => {
        if (!pill.range.startContainer.isConnected) {
          return;
        }
        onSelect(pill);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      style={{ left: `${pill.left}px`, top: `${pill.top}px`, translate: pill.translate }}
      type="button"
    >
      {!isReplying && <SparklesIcon />}
      {isReplying ? "Ответить" : "Спросить в чате"}
    </button>
  );
};
