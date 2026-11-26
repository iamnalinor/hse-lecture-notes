import { findBlockTextForQuote, readDocumentBody } from "../course-repo";
import type { TrackedD1 } from "../db";
import type { QuotePayload } from "../types";
import { readOwnedFinishedAssistantText } from "./thread-repo";

// =============================================================================
// Quote canonicalization & validation against D1 course materials
// =============================================================================

/**
 * Canonicalizes Russian + LaTeX quote strings so selections across KaTeX formulas,
 * newlines, typography dashes/quotes, and block boundaries match the source TeX reliably.
 */
export function normalizeQuoteText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[«»„“”]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\$\$/g, "$")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "$")
    .replace(/\s+/g, " ")
    .replace(/\s*([.,;:!?()[\]{}])\s*/g, "$1")
    .replace(/\$\s+/g, "$")
    .replace(/\s+\$/g, "$")
    .trim()
    .toLowerCase();
}

function stripTexMarkupForFallback(input: string): string {
  return normalizeQuoteText(
    input
      .replace(/\\(?:N|Z|Q|R|C|F)\b/g, (m) => m.slice(1))
      .replace(/\\(?:Id|sgn|rk|tr|Mat)\b/g, (m) => m.slice(1))
      .replace(/\\(?:varepsilon|eps)\b/g, "eps")
      .replace(/\\(?:leqslant|leq|le)\b/g, "<=")
      .replace(/\\(?:geqslant|geq|ge)\b/g, ">=")
      .replace(/\\(?:rwv|rw)\{([^{}]*)\}/g, "$1")
      .replace(
        /\\(?:textbf|textit|emph|text|mathrm|mathbf|mathcal|mathbb|operatorname)\{([^{}]*)\}/g,
        "$1",
      )
      .replace(/\[([^\]]+)\]\(#[^)]+\)/g, "$1")
      .replace(/\[-?@[^\]]+\]/g, " ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?)]|$)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$/g, ""),
  );
}

function hasOrderedWordCoverage(haystack: string, needle: string): boolean {
  const words = needle.match(/[a-zа-яё0-9]{3,}/gi) ?? [];
  if (words.length < 3) return false;
  let pos = 0;
  let matched = 0;
  for (const w of words) {
    const idx = haystack.indexOf(w, pos);
    if (idx !== -1) {
      matched += 1;
      pos = idx + w.length;
    }
  }
  return matched / words.length >= 0.8;
}

function containsNormalized(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const normNeedle = normalizeQuoteText(needle);
  if (normNeedle.length < 2) return false;
  const normHaystack = normalizeQuoteText(haystack);
  if (normHaystack.includes(normNeedle)) return true;

  // Fallback for selections that cross KaTeX macro expansions (\N -> \mathbb{N}) or Markdown *emphasis*
  const plainNeedle = stripTexMarkupForFallback(needle);
  const plainHaystack = stripTexMarkupForFallback(haystack);
  if (plainNeedle.length >= 2 && plainHaystack.includes(plainNeedle)) {
    return true;
  }
  if (hasOrderedWordCoverage(plainHaystack, plainNeedle)) {
    return true;
  }
  return false;
}

/** The text of an assistant answer as the student sees it: Markdown and math delimiters dropped. */
function visibleAssistantText(contentTex: string): string {
  return contentTex
    .split("```")
    .map((part, index) => {
      if (index % 2) return part.slice(part.indexOf("\n") + 1);
      const blocks = part.replace(/^ {0,3}#{1,6}[ \t]+|^\s*(?:[-*•]|\d+\.)[ \t]+/gmu, "");
      const mathNormalized = blocks.replace(
        /`[^`]*`|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/gu,
        (raw, inline, display) =>
          inline !== undefined || display !== undefined ? `$${(inline ?? display).trim()}$` : raw,
      );
      return mathNormalized.replace(
        /\$\$([^$]+)\$\$|(\$[^$]+\$)|`([^`]+)`|\[([^\]]+)\]\((?:#|\/)[^)]*\)|\[\[[^|\]]+\|([^\]]+)\]\]|\*\*([^*]+)\*\*|\*(\S(?:[^*]*?\S)?)\*|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+)(?<!\s)_(?![\p{L}\p{N}_])/gu,
        (_match, display, math, code, link, wiki, bold, italic, underscore) =>
          display !== undefined
            ? `$${display.trim()}$`
            : (math ?? code ?? link ?? wiki ?? bold ?? italic ?? underscore),
      );
    })
    .join(" ");
}

/** A quote of a previous assistant message must come from a finished message of the caller's own thread. */
export async function validateAssistantQuote(
  db: TrackedD1,
  threadId: string | null,
  quote: QuotePayload,
  browserId: string,
  telegramId?: number,
): Promise<boolean> {
  if (
    !threadId ||
    typeof quote.messageId !== "string" ||
    !quote.messageId ||
    quote.blockId ||
    quote.sectionId
  )
    return false;
  const row = await readOwnedFinishedAssistantText(
    db,
    quote.messageId,
    threadId,
    telegramId === undefined ? { browserId } : { telegramId },
  );
  if (!row) return false;
  const normalize = (s: string) => s.replace(/\s+/gu, " ").trim();
  const needle = normalize(quote.tex);
  if (needle.length < 2) return false;
  if (normalize(row.content_tex).includes(needle)) return true;
  return normalize(visibleAssistantText(row.content_tex)).includes(needle);
}

/** A quote of course material must appear in the named block, or anywhere in the document body. */
export async function validateQuoteAgainstCourse(
  db: TrackedD1,
  course: string,
  docId: string,
  quote: QuotePayload,
): Promise<boolean> {
  if (!quote.tex || !quote.tex.trim()) return false;

  // 1. If a specific blockId is provided, check that block first (1 PK read)
  if (quote.blockId) {
    const block = await findBlockTextForQuote(db, course, docId, quote.blockId);
    if (block && block.course === course && block.doc_id === docId) {
      const combined = `${block.title}\n${block.statement_tex}\n${block.proof_tex}`;
      if (containsNormalized(combined, quote.tex)) return true;
    }
  }

  // 2. Check the full source document body (covers cross-block selections & plain prose)
  const doc = await readDocumentBody(db, course, docId);
  if (!doc) return false;
  return containsNormalized(doc.body_tex, quote.tex);
}
