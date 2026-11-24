import { expect, it } from "vitest";

import { parseChatBlocks } from "./chat-markdown-parse.ts";

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
