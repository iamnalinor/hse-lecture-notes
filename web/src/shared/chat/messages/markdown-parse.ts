import { hashTarget } from "#web/shared/ui/dom.ts";

import { readTable, type TableBlock } from "./markdown-table.ts";
import { normalizeChatMath } from "./math.ts";

export type InlineSpan =
  | { readonly end: number; readonly kind: "bold" | "italic"; readonly text: string }
  | { readonly end: number; readonly kind: "code"; readonly text: string }
  | { readonly end: number; readonly kind: "ref"; readonly label: string; readonly target: string };

export type ParsedPiece =
  | { readonly kind: "plain"; readonly pos: number; readonly text: string }
  | { readonly kind: "span"; readonly pos: number; readonly span: InlineSpan };

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export type BlockSegment =
  | TableBlock
  | { readonly kind: "code"; readonly lang: string; readonly value: string }
  | { readonly kind: "display-math"; readonly value: string }
  | { readonly kind: "heading"; readonly tag: (typeof headingTags)[number]; readonly value: string }
  | { readonly kind: "list"; readonly items: readonly string[]; readonly ordered: boolean }
  | { readonly kind: "paragraph"; readonly value: string };

export const isMaterialLink = (target: string): boolean => {
  const [path = "", hash, extra] = target.split("#", 3);
  return (
    extra === undefined &&
    /^\/[a-z]+\/[\w-]+$/u.test(path) &&
    (hash === undefined || /^[\p{L}\p{N}_.:-]+$/u.test(hashTarget(hash)))
  );
};

const matchMdRef = (text: string, pos: number): InlineSpan | null => {
  const closeBracket = text.indexOf("]", pos + 1);
  if (closeBracket === -1 || text[closeBracket + 1] !== "(") {
    return null;
  }
  const closeParen = text.indexOf(")", closeBracket + 2);
  if (closeParen === -1) {
    return null;
  }
  const label = text.slice(pos + 1, closeBracket);
  const href = text.slice(closeBracket + 2, closeParen).trim();
  const target = href.startsWith("#") ? href.slice(1) : href;
  if (!href.startsWith("#") && !isMaterialLink(href)) {
    return null;
  }
  return label === "" || target === "" || /[\n[]/u.test(label)
    ? null
    : { end: closeParen + 1, kind: "ref", label, target };
};

const matchWikiRef = (text: string, pos: number): InlineSpan | null => {
  const close = text.indexOf("]]", pos + 2);
  if (close === -1) {
    return null;
  }
  const body = text.slice(pos + 2, close);
  const pipe = body.indexOf("|");
  return pipe <= 0 || pipe === body.length - 1
    ? null
    : { end: close + 2, kind: "ref", label: body.slice(pipe + 1), target: body.slice(0, pipe) };
};

const matchDelimited = (text: string, pos: number, delim: "*" | "**" | "`"): InlineSpan | null => {
  const close = text.indexOf(delim, pos + delim.length);
  if (close <= pos + delim.length) {
    return null;
  }
  const inner = text.slice(pos + delim.length, close);
  if (delim === "*" && inner.trim() !== inner) {
    return null;
  }
  return {
    end: close + delim.length,
    kind: ({ "**": "bold", "*": "italic", "`": "code" } as const)[delim],
    text: inner,
  };
};

const matchSpanAt = (text: string, pos: number): InlineSpan | null => {
  const ch = text[pos];
  if (ch === "[" && text[pos + 1] === "[") {
    return matchWikiRef(text, pos);
  }
  if (ch === "[") {
    return matchMdRef(text, pos);
  }
  if (ch === "*") {
    return matchDelimited(text, pos, text[pos + 1] === "*" ? "**" : "*");
  }
  if (ch === "_") {
    const pattern = /(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+)(?<!\s)_(?![\p{L}\p{N}_])/uy;
    pattern.lastIndex = pos;
    const inner = pattern.exec(text)?.[1];
    return inner === undefined ? null : { end: pattern.lastIndex, kind: "italic", text: inner };
  }
  return ch === "`" ? matchDelimited(text, pos, "`") : null;
};

const cutPlainTail = (text: string): string => {
  let out = text;
  if ((out.split("$$").length - 1) % 2 === 1) {
    out = out.slice(0, out.lastIndexOf("$$"));
  }
  if ((out.replaceAll("$$", "").split("$").length - 1) % 2 === 1) {
    out = out.slice(0, out.lastIndexOf("$"));
  }
  if ((out.split("**").length - 1) % 2 === 1) {
    out = out.slice(0, out.lastIndexOf("**"));
  }
  if (out.lastIndexOf("[[") > out.lastIndexOf("]]")) {
    out = out.slice(0, out.lastIndexOf("[["));
  }
  return out;
};

/** Cuts incomplete trailing `$`, `$$`, `**`, or `[[` while streaming outside fenced code blocks. */
export const safeStreamCut = (source: string): string => {
  const text = normalizeChatMath(source);
  if ((text.split("```").length - 1) % 2 === 1) {
    return text;
  }
  const lastFence = text.lastIndexOf("```");
  return lastFence === -1
    ? cutPlainTail(text)
    : text.slice(0, lastFence + 3) + cutPlainTail(text.slice(lastFence + 3));
};

const pushPlainSlice = (
  pieces: ParsedPiece[],
  text: string,
  bounds: readonly [number, number],
): void => {
  const [start, end] = bounds;
  if (end > start) {
    pieces.push({ kind: "plain", pos: start, text: text.slice(start, end) });
  }
};

const mathEnd = (text: string, pos: number): number =>
  text[pos] === "$" ? text.indexOf("$", pos + 1) : -1;

export const scanInlinePieces = (text: string): readonly ParsedPiece[] => {
  const pieces: ParsedPiece[] = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const end = mathEnd(text, cursor);
    const matched = end === -1 ? matchSpanAt(text, cursor) : null;
    if (matched === null) {
      cursor = Math.max(cursor + 1, end + 1);
      continue;
    }
    pushPlainSlice(pieces, text, [plainStart, cursor]);
    pieces.push({ kind: "span", pos: cursor, span: matched });
    cursor = matched.end;
    plainStart = matched.end;
  }
  pushPlainSlice(pieces, text, [plainStart, text.length]);
  return pieces;
};

type TextBuffer = {
  readonly kind: "ordered" | "paragraph" | "unordered";
  readonly items: readonly string[];
};
const emptyTextBuffer = (): TextBuffer => ({ kind: "paragraph", items: [] });
const flushTextBlock = (buffer: TextBuffer, blocks: BlockSegment[]): void => {
  if (buffer.items.length > 0) {
    blocks.push(
      buffer.kind === "paragraph"
        ? { kind: "paragraph", value: buffer.items.join(" ") }
        : { kind: "list", ordered: buffer.kind === "ordered", items: buffer.items },
    );
  }
};
const consumeTextLine = (buffer: TextBuffer, line: string, blocks: BlockSegment[]): TextBuffer => {
  const marker = /^(?:(\d+)\.|[-*•])[ \t]+(\S.*)$/u.exec(line.trimStart());
  if (marker !== null) {
    const kind = marker[1] === undefined ? "unordered" : "ordered";
    if (buffer.kind !== kind) {
      flushTextBlock(buffer, blocks);
      return { kind, items: [marker[2] ?? ""] };
    }
    return { kind, items: [...buffer.items, marker[2] ?? ""] };
  }
  if (line.trim() === "") {
    if (buffer.kind === "paragraph") {
      flushTextBlock(buffer, blocks);
      return emptyTextBuffer();
    }
    return buffer;
  }
  return consumeNonListLine(buffer, line, blocks);
};
const consumeNonListLine = (
  buffer: TextBuffer,
  line: string,
  blocks: BlockSegment[],
): TextBuffer => {
  if (buffer.kind === "paragraph") {
    return { ...buffer, items: [...buffer.items, line.trim()] };
  }
  if (/^\s/u.test(line) && buffer.items.length > 0) {
    return {
      ...buffer,
      items: [...buffer.items.slice(0, -1), `${buffer.items.at(-1) ?? ""} ${line.trim()}`],
    };
  }
  flushTextBlock(buffer, blocks);
  return { kind: "paragraph", items: [line.trim()] };
};
const appendTextBlocks = (lines: readonly string[], blocks: BlockSegment[]): void => {
  let buffer = emptyTextBuffer();
  for (const line of lines) {
    buffer = consumeTextLine(buffer, line, blocks);
  }
  flushTextBlock(buffer, blocks);
};

const headingOf = (line: string): BlockSegment | null => {
  const match = /^ {0,3}(#{1,6})(?=[ \t]|$)/u.exec(line);
  const tag = headingTags[(match?.[1]?.length ?? 0) - 1];
  return match === null || tag === undefined
    ? null
    : {
        kind: "heading",
        tag,
        value: line.slice(match[0].length).trimEnd().replace(/\s#+$/u, "").trim(),
      };
};

/** Headings and tables stand alone; the text lines between them become paragraphs and lists. */
const appendParagraphs = (trimmed: string, blocks: BlockSegment[]): void => {
  const all = trimmed.split("\n");
  let pending: string[] = [];
  let index = 0;
  while (index < all.length) {
    const table = readTable(all, index);
    const line = all[index] ?? "";
    const block = table?.block ?? headingOf(line);
    if (block === null) {
      pending.push(line);
    } else {
      appendTextBlocks(pending, blocks);
      pending = [];
      blocks.push(block);
    }
    index = table?.next ?? index + 1;
  }
  appendTextBlocks(pending, blocks);
};

const appendProseSegment = (source: string, blocks: BlockSegment[]): void => {
  for (const part of source.split(/(\$\$[^$]+\$\$)/)) {
    const trimmed = part.trim();
    if (trimmed === "") {
      continue;
    }
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      blocks.push({ kind: "display-math", value: trimmed.slice(2, -2).trim() });
    } else {
      appendParagraphs(trimmed, blocks);
    }
  }
};

export const parseChatBlocks = (source: string): readonly BlockSegment[] => {
  const blocks: BlockSegment[] = [];
  for (const [idx, raw] of normalizeChatMath(source).split("```").entries()) {
    if (idx % 2 === 0) {
      appendProseSegment(raw, blocks);
      continue;
    }
    const nl = raw.indexOf("\n");
    const lang = nl === -1 ? "" : raw.slice(0, nl).trim();
    const code = (nl === -1 ? raw : raw.slice(nl + 1)).replace(/\n$/, "");
    blocks.push({ kind: "code", lang, value: code });
  }
  return blocks;
};
