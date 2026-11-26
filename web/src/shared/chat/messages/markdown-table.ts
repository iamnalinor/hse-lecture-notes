/** GFM tables in chat answers: `| a | b |`, a separator row `|:--|:-:|`, then body rows. */
export type TableAlign = "center" | "left" | "right" | null;
export type TableBlock = {
  readonly kind: "table";
  readonly align: readonly TableAlign[];
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

/**
Row tokens: an escaped `\|`, `$…$` math and `` `code` `` (a `|` inside them is not a boundary, as in `$|x|$`),
a bare `|`, anything else.
*/
const TOKEN = /\\\||\$[^$]*\$|`[^`]*`|[|$`\\]|[^|$`\\]+/gu;

const stripOuterPipes = (line: string): string => {
  const trimmed = line.trim();
  const head = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  return head.endsWith("|") && !head.endsWith("\\|") ? head.slice(0, -1) : head;
};

/** Splits a row on `|`; the outer pipes of `| a | b |` are optional, as in GFM. */
export const splitRow = (line: string): string[] =>
  stripOuterPipes(line)
    .matchAll(TOKEN)
    .reduce<string[]>(
      (cells, [token]) =>
        token === "|"
          ? [...cells, ""]
          : [...cells.slice(0, -1), `${cells.at(-1) ?? ""}${token === "\\|" ? "|" : token}`],
      [""],
    )
    .map((cell) => cell.trim());

const SEPARATOR_CELL = /^:?-+:?$/u;

const alignOf = (cell: string): TableAlign => {
  const isLeft = cell.startsWith(":");
  const isRight = cell.endsWith(":");
  if (isLeft && isRight) {
    return "center";
  }
  if (isRight) {
    return "right";
  }
  return isLeft ? "left" : null;
};

/** The separator row's alignments, or null if the line is not a separator for `width` columns. */
const parseSeparator = (line: string, width: number): null | TableAlign[] => {
  if (!line.includes("-")) {
    return null;
  }
  const cells = splitRow(line);
  return cells.length === width && cells.every((cell) => SEPARATOR_CELL.test(cell))
    ? cells.map((cell) => alignOf(cell))
    : null;
};

const isRowLine = (line: string): boolean => line.includes("|") && line.trim() !== "";

/**
A table starting at `lines[start]`: the block and the index after its last row, or null if the lines there
are not a table (a header row needs a matching separator right under it).
*/
export const readTable = (
  lines: readonly string[],
  start: number,
): null | { readonly block: TableBlock; readonly next: number } => {
  const headerLine = lines[start];
  const separatorLine = lines[start + 1];
  if (headerLine === undefined || separatorLine === undefined || !isRowLine(headerLine)) {
    return null;
  }
  const header = splitRow(headerLine);
  const align = parseSeparator(separatorLine, header.length);
  if (align === null) {
    return null;
  }
  const rows: string[][] = [];
  let next = start + 2;
  for (let line = lines[next]; line !== undefined && isRowLine(line); line = lines[next]) {
    const cells = splitRow(line);
    rows.push(header.map((_, column) => cells[column] ?? ""));
    next += 1;
  }
  return { block: { kind: "table", align, header, rows }, next };
};
