import { Element } from "html-react-parser";

import { textOf } from "./dom-utils.ts";

const elements = (node: Element): Element[] =>
  node.children.filter((child): child is Element => child instanceof Element);

const childNamed = (node: Element, name: string): Element | undefined =>
  elements(node).find((child) => child.name === name);

/** Column names of a pandoc table: the cells of its header row, as text. */
export const headerLabels = (table: Element): readonly string[] => {
  const row = childNamed(childNamed(table, "thead") ?? table, "tr");
  return row === undefined
    ? []
    : elements(row)
        .filter((child) => child.name === "th")
        .map((th) => textOf(th).trim());
};

/** The column name of a body cell (`td` → its `th`); `undefined` in a table without a header. */
export const columnLabel = (cell: Element): string | undefined => {
  const row = cell.parent;
  const body = row instanceof Element ? row.parent : undefined;
  const table = body instanceof Element ? body.parent : undefined;
  if (!(row instanceof Element) || !(table instanceof Element)) {
    return undefined;
  }
  const label = headerLabels(table)[elements(row).indexOf(cell)];
  return label === "" ? undefined : label;
};
