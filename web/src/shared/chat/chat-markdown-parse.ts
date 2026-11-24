import { hashTarget } from "#web/shared/ui/dom.ts";

export type InlineSpan =
  | { readonly end: number; readonly kind: "bold" | "italic"; readonly text: string }
  | { readonly end: number; readonly kind: "code"; readonly text: string }
  | { readonly end: number; readonly kind: "ref"; readonly label: string; readonly target: string };

export type ParsedPiece =
  | { readonly kind: "plain"; readonly pos: number; readonly text: string }
  | { readonly kind: "span"; readonly pos: number; readonly span: InlineSpan };

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export type BlockSegment =
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
  const closeBracket = text.indexOf("](", pos + 1);
  if (closeBracket === -1) {
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
  return label === "" || target === "" || label.includes("\n")
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
export const safeStreamCut = (text: string): string => {
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

const parseParagraph = (para: string): BlockSegment | null => {
  const lines = para
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    return null;
  }
  if (lines.every((line) => /^[-*•]\s+/.test(line))) {
    return {
      items: lines.map((line) => line.replace(/^[-*•]\s+/, "")),
      kind: "list",
      ordered: false,
    };
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return {
      items: lines.map((line) => line.replace(/^\d+\.\s+/, "")),
      kind: "list",
      ordered: true,
    };
  }
  return { kind: "paragraph", value: lines.join(" ") };
};

const appendParagraphs = (trimmed: string, blocks: BlockSegment[]): void => {
  const lines: string[] = [];
  const flush = (): void => {
    const segment = parseParagraph(lines.join("\n"));
    if (segment !== null) {
      blocks.push(segment);
    }
    lines.length = 0;
  };

  for (const line of trimmed.split("\n")) {
    const match = /^ {0,3}(#{1,6})(?=[ \t]|$)/u.exec(line);
    const tag = headingTags[(match?.[1]?.length ?? 0) - 1];
    if (match !== null && tag !== undefined) {
      flush();
      blocks.push({
        kind: "heading",
        tag,
        value: line.slice(match[0].length).trimEnd().replace(/\s#+$/u, "").trim(),
      });
    } else if (line.trim() === "") {
      flush();
    } else {
      lines.push(line);
    }
  }
  flush();
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
  for (const [idx, raw] of source.split("```").entries()) {
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
