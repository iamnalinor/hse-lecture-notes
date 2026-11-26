import { expect, it } from "vitest";

import {
  parseChatBlocks,
  safeStreamCut,
  scanInlinePieces,
} from "#web/shared/chat/messages/markdown-parse.ts";

it("separates a list from its introduction and following paragraph without blank lines", () => {
  expect(
    parseChatBlocks(
      "Задачу нужно защитить устно:\n- **OK** — приняли.\n- **RJ** — не приняли.\nМожно исправить и отправить снова.",
    ),
  ).toEqual([
    { kind: "paragraph", value: "Задачу нужно защитить устно:" },
    { kind: "list", ordered: false, items: ["**OK** — приняли.", "**RJ** — не приняли."] },
    { kind: "paragraph", value: "Можно исправить и отправить снова." },
  ]);
});

it("keeps multiline items and blank-separated list items together", () => {
  expect(
    parseChatBlocks(
      "Порядок:\n1. Найди условие.\n   Проверь ограничения.\n\n2. Реши задачу.\n\n### Проверка\n- Подставь ответ.\n- Проверь границы.",
    ),
  ).toEqual([
    { kind: "paragraph", value: "Порядок:" },
    { kind: "list", ordered: true, items: ["Найди условие. Проверь ограничения.", "Реши задачу."] },
    { kind: "heading", tag: "h3", value: "Проверка" },
    { kind: "list", ordered: false, items: ["Подставь ответ.", "Проверь границы."] },
  ]);
});

it("accepts standard TeX delimiters without treating display math as a material link", () => {
  expect(
    parseChatBlocks(
      String.raw`Для \(f(x)>0\): \[f(x)^{g(x)}=e^{g(x)\ln f(x)}.\] См. [памятку](/calculus/quiz-limits).`,
    ),
  ).toEqual([
    { kind: "paragraph", value: "Для $f(x)>0$:" },
    { kind: "display-math", value: String.raw`f(x)^{g(x)}=e^{g(x)\ln f(x)}.` },
    { kind: "paragraph", value: "См. [памятку](/calculus/quiz-limits)." },
  ]);
});

it("preserves TeX delimiter examples inside inline and fenced code", () => {
  const source = [
    "Пиши \\(x\\), пример кода: `\\[y\\]`.",
    "",
    "```tex",
    String.raw`\(z\)`,
    "```",
  ].join("\n");
  expect(parseChatBlocks(source)).toEqual([
    { kind: "paragraph", value: "Пиши $x$, пример кода: `\\[y\\]`." },
    { kind: "code", lang: "tex", value: String.raw`\(z\)` },
  ]);
});

it.each([String.raw`Вычислим \(x^2`, String.raw`Вычислим \[x^2`])(
  "hides incomplete standard TeX while streaming: %s",
  (source) => {
    expect(safeStreamCut(source)).toBe("Вычислим ");
  },
);

it("preserves matrix row spacing inside existing and standard display math", () => {
  const formula = String.raw`\begin{pmatrix}1 & 2 \\[2pt] 3 & 4\end{pmatrix}`;
  for (const source of [`$$${formula}$$`, String.raw`\[${formula}\]`]) {
    expect(parseChatBlocks(source)).toEqual([{ kind: "display-math", value: formula }]);
  }
});

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

it.each([" ", "\n", "\n  "])(
  "accepts whitespace around material link destinations: %j",
  (space) => {
    const target = "/calculus/09_nov06_asymptotes_o_symbols#def:lec09:o";
    const source = `Это определение есть в [лекции об О-символике](${space}${target}${space}).`;
    const blocks = parseChatBlocks(source);
    const paragraph = blocks[0];
    expect(paragraph?.kind).toBe("paragraph");
    if (paragraph?.kind !== "paragraph") {
      throw new Error("Missing paragraph");
    }
    const spans = scanInlinePieces(paragraph.value)
      .filter((piece) => piece.kind === "span")
      .map((piece) => piece.span);
    expect(spans).toMatchObject([{ kind: "ref", label: "лекции об О-символике", target }]);
  },
);

it("keeps the material-link restriction when trimming whitespace", () => {
  expect(
    scanInlinePieces("[ссылка]( javascript:alert(1) )").some((piece) => piece.kind === "span"),
  ).toBe(false);
});

it("keeps ordinary interval brackets in prose before a citation", () => {
  expect(scanInlinePieces("На [a,b] см. [лекцию](#sec)")).toMatchObject([
    { kind: "plain", text: "На [a,b] см. " },
    { kind: "span", span: { kind: "ref", label: "лекцию", target: "sec" } },
  ]);
});

it("parses a GFM table with alignment, math holding |, code and an escaped pipe in cells", () => {
  expect(
    parseChatBlocks(
      [
        "Сравним:",
        "",
        "| Норма | Формула | Код |",
        "|:--|:-:|--:|",
        "| модуль | $|x|$ | `a || b` |",
        String.raw`| знак \| | $x$ | — |`,
        "",
        "Итог.",
      ].join("\n"),
    ),
  ).toEqual([
    { kind: "paragraph", value: "Сравним:" },
    {
      kind: "table",
      align: ["left", "center", "right"],
      header: ["Норма", "Формула", "Код"],
      rows: [
        ["модуль", "$|x|$", "`a || b`"],
        ["знак |", "$x$", "—"],
      ],
    },
    { kind: "paragraph", value: "Итог." },
  ]);
});

it("keeps lines with pipes as text when no separator row follows", () => {
  expect(parseChatBlocks("| a | b |\nпросто текст")).toEqual([
    { kind: "paragraph", value: "| a | b | просто текст" },
  ]);
});

it("pads short rows and drops extra cells, so every row has the header's width", () => {
  expect(parseChatBlocks("a | b\n--- | ---\n1 |\n1 | 2 | 3")).toEqual([
    {
      kind: "table",
      align: [null, null],
      header: ["a", "b"],
      rows: [
        ["1", ""],
        ["1", "2"],
      ],
    },
  ]);
});

it("treats a pipe after an even run of backslashes as a cell boundary", () => {
  expect(parseChatBlocks(["| a | b |", "|---|---|", String.raw`| x\\ | y\\|`].join("\n"))).toEqual([
    {
      kind: "table",
      align: [null, null],
      header: ["a", "b"],
      rows: [[String.raw`x\\`, String.raw`y\\`]],
    },
  ]);
});
