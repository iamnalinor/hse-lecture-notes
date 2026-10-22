import { describe, expect, it } from "vitest";

import { plural, readingMinutes, splitTex, stripTags } from "./text.ts";

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

describe("stripTags", () => {
  it("drops markup and keeps the text", () => {
    expect(stripTags('<b>а</b><span class="x">б</span>').replaceAll(/\s+/gu, "")).toBe("аб");
  });
});

describe("readingMinutes", () => {
  it("rounds the text length up to whole minutes", () => {
    expect(readingMinutes("")).toBe(0);
    expect(readingMinutes(`<p>${"а".repeat(901)}</p>`)).toBe(2);
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
