import { describe, expect, it } from "vitest";

import { formatSize, plural, readingMinutes, splitTex, stripTags } from "./text.ts";

const FORMS = ["конспект", "конспекта", "конспектов"] as const;

describe("plural", () => {
  it.each([
    [1, "конспект"],
    [3, "конспекта"],
    [5, "конспектов"],
    [11, "конспектов"],
    [14, "конспектов"],
    [21, "конспект"],
    [22, "конспекта"],
    [0, "конспектов"],
  ])("%i → %s", (n, expected) => {
    expect(plural(n, FORMS)).toBe(expected);
  });
});

describe("formatSize", () => {
  it.each([
    [100, "1 КБ"],
    [860_000, "840 КБ"],
    [3_460_000, "3,3 МБ"],
    [2 * 1024 * 1024, "2 МБ"],
  ])("%i → %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

describe("stripTags", () => {
  it("drops markup and keeps the text", () => {
    expect(stripTags('<b>а</b><span class="x">б</span>').replaceAll(/\s+/gu, "")).toBe("аб");
  });
});

const words = (n: number) => Array.from({ length: n }, () => "слово").join(" ");
const inline = (tex: string) => `<span class="math inline">${tex}</span>`;
const display = (tex: string) => `<span class="math display">${tex}</span>`;

describe("readingMinutes", () => {
  it("is 0 for an empty document and rounds up to whole minutes", () => {
    expect(readingMinutes("")).toBe(0);
    expect(readingMinutes(`<p>${words(130)}</p>`)).toBe(1);
    expect(readingMinutes(`<p>${words(131)}</p>`)).toBe(2);
  });

  it("counts words of prose, not characters or tag whitespace", () => {
    // 260 words: two minutes however long they are and however they are wrapped in tags
    const long = Array.from({ length: 260 }, () => "длиннейшее_слово_из_многих_букв").join(" ");
    expect(readingMinutes(`<p>${long}</p>`)).toBe(2);
    expect(readingMinutes(`<p>${words(130)}</p>\n<p>${words(130)}</p>`)).toBe(2);
    // inline tags do not split a word: «мат<em>анализ</em>» is one word
    expect(readingMinutes(`<p>${words(129)} мат<em>анализ</em></p>`)).toBe(1);
  });

  it("does not count the TeX source of a formula as words", () => {
    const tex = String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix} \cdot \text{очень длинный текст формулы}`;
    expect(readingMinutes(`<p>${words(100)} ${inline(tex)}</p>`)).toBe(1);
    expect(readingMinutes(`<p>${words(100)}</p>${display(tex)}`)).toBe(1);
  });

  it("weighs an inline formula as two words and a display one as ten", () => {
    // 130 minus the weight fits one minute, one more word makes it two
    expect(readingMinutes(`<p>${words(128)} ${inline("x")}</p>`)).toBe(1);
    expect(readingMinutes(`<p>${words(129)} ${inline("x")}</p>`)).toBe(2);
    expect(readingMinutes(`<p>${words(120)}</p>${display("x")}`)).toBe(1);
    expect(readingMinutes(`<p>${words(121)}</p>${display("x")}`)).toBe(2);
  });

  it("glues a formula to the punctuation next to it instead of counting it as a word", () => {
    expect(readingMinutes(`<p>${words(126)} ${inline("x")}, ${inline("y")}.</p>`)).toBe(1);
  });
});

describe("splitTex", () => {
  it("separates inline formulas from text", () => {
    expect(splitTex(String.raw`свойство 1: $\det A^T = \det A$ и $e$`)).toStrictEqual([
      { kind: "text", value: "свойство 1: " },
      { kind: "math", value: String.raw`\det A^T = \det A` },
      { kind: "text", value: " и " },
      { kind: "math", value: "e" },
    ]);
  });

  it("keeps text without formulas and a lone dollar as is", () => {
    expect(splitTex("цена $5")).toStrictEqual([{ kind: "text", value: "цена $5" }]);
  });
});
