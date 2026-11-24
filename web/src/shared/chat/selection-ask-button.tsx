import { type JSX, useEffect, useState } from "react";

import type { ChatQuote } from "#web/domain/chat.ts";

import { useChat } from "./chat-context.tsx";
import { SparklesIcon } from "./chat-icons.tsx";

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
  for (const noise of frag.querySelectorAll('a[href^="#"]:not(.ref), .sr-only, summary')) {
    noise.remove();
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
  readonly quote: ChatQuote;
  readonly range: Range;
  readonly top: number;
};

const getProseSelectionRange = (): null | Range => {
  const sel = globalThis.window.getSelection();
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const container = nodeToElement(range.commonAncestorContainer);
  const prose = container?.closest(".prose-notes") ?? null;
  if (prose === null) {
    return null;
  }
  return range.toString().trim().length >= 2 ? range : null;
};

const computePillCoords = (
  rects: readonly DOMRect[],
): null | { readonly left: number; readonly top: number } => {
  const anchorRect = rects.at(-1);
  if (anchorRect === undefined) {
    return null;
  }
  const isMobile = globalThis.window.innerWidth <= 720;
  const isChatOpen = document.documentElement.classList.contains("ai-open");
  const viewportW = globalThis.window.innerWidth;
  const maxRight =
    (isChatOpen && !isMobile
      ? (document.querySelector("#ai-panel")?.getBoundingClientRect().left ?? viewportW)
      : viewportW) - 8;
  const left = Math.max(8, Math.min(anchorRect.right - 68, maxRight - 136));
  let top = anchorRect.bottom + (isMobile ? 34 : 8);
  if (top + 36 > globalThis.window.innerHeight - 8 && rects[0] !== undefined) {
    top = rects[0].top - 40;
  }
  return {
    left: left + globalThis.window.scrollX,
    top: Math.max(8, top) + globalThis.window.scrollY,
  };
};

const computeSelPill = (): FloatingPill | null => {
  const range = getProseSelectionRange();
  if (range === null) {
    return null;
  }
  const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  const coords = computePillCoords(rects);
  if (coords === null) {
    return null;
  }
  const expanded = expandToMath(range);
  const tex = rangeToTeX(expanded);
  if (tex.length < 2 || tex.length > 3500) {
    return null;
  }
  const { blockId, label } = sourceOfRange(expanded);
  const quote: ChatQuote = blockId === undefined ? { label, tex } : { blockId, label, tex };
  return { ...coords, quote, range: expanded };
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

/** Exact `.ai-sel-btn` floating button from prototype.html when selecting text in notes. */
export const SelectionAskButton = (): JSX.Element | null => {
  const chat = useChat();
  const [pill, setPill] = useState<FloatingPill | null>(null);
  const isActive = chat.isConfigured && chat.docContext.docId !== "";

  useEffect(() => {
    if (!isActive) {
      return;
    }
    let timer: null | ReturnType<typeof globalThis.setTimeout> = null;
    const update = (): void => {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
      timer = globalThis.setTimeout(() => {
        if (globalThis.document.activeElement?.classList.contains("ai-sel-btn") !== true) {
          setPill(computeSelPill());
        }
      }, 0);
    };
    const onSelectionChange = (): void => {
      const sel = globalThis.window.getSelection();
      if (
        globalThis.document.activeElement?.classList.contains("ai-sel-btn") !== true &&
        (sel === null || sel.isCollapsed)
      ) {
        setPill(null);
      }
    };
    document.addEventListener("mouseup", update);
    document.addEventListener("keyup", update);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
      document.removeEventListener("mouseup", update);
      document.removeEventListener("keyup", update);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [isActive]);

  useEffect(() => {
    if (chat.quote === null) {
      highlightQuoteRange(null);
    }
  }, [chat.quote]);

  if (!isActive) {
    return null;
  }

  return (
    <button
      aria-label="Спросить ИИ о выделенном фрагменте"
      className={pill === null ? "ai-sel-btn" : "ai-sel-btn is-on"}
      disabled={pill === null}
      onClick={() => {
        if (pill === null) {
          return;
        }
        highlightQuoteRange(pill.range);
        chat.openWithQuote(pill.quote);
        setPill(null);
        globalThis.window.getSelection()?.removeAllRanges();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      style={pill === null ? undefined : { left: `${pill.left}px`, top: `${pill.top}px` }}
      type="button"
    >
      <SparklesIcon />
      Спросить ИИ
    </button>
  );
};
