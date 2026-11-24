import { expect, it } from "vitest";

import { parseChatBlocks, scanInlinePieces } from "./chat-markdown-parse.ts";

it("separates headings from adjacent prose and preserves display math and fenced code", () => {
  const source = [
    "Решение СЛАУ",
    "### Матричная запись",
    "Матрица $A$",
    "$$A x = b$$",
    "### Метод Гаусса",
    "```c",
    "#include <stdio.h>",
    "```",
  ].join("\n");
  expect(parseChatBlocks(source)).toEqual([
    { kind: "paragraph", value: "Решение СЛАУ" },
    { kind: "heading", tag: "h3", value: "Матричная запись" },
    { kind: "paragraph", value: "Матрица $A$" },
    { kind: "display-math", value: "A x = b" },
    { kind: "heading", tag: "h3", value: "Метод Гаусса" },
    { kind: "code", lang: "c", value: "#include <stdio.h>" },
  ]);
});

it("renders emphasis without consuming multiplication inside math or code", () => {
  const pieces = scanInlinePieces("_другая операция_ foo_bar_baz $a_i*b_j$ `a*b*c` *тоже курсив*");
  expect(pieces.map((piece) => (piece.kind === "plain" ? piece.text : piece.span.kind))).toEqual([
    "italic",
    " foo_bar_baz $a_i*b_j$ ",
    "code",
    " ",
    "italic",
  ]);
});
