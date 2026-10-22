import { describe, expect, it } from "vitest";

import type { LabelIndex, SearchEntry } from "./schemas.ts";

import { prepareIndex, queryTerms, search, snippetOf } from "./search.ts";

const entry = (anchor: string, heading: string, text: string): SearchEntry => ({
  anchor,
  course: "algebra",
  doc: "05_laplace",
  heading,
  lecture: 5,
  text,
});

const ENTRIES = prepareIndex([
  entry("sec:minors", "Миноры", "Дополняющий минор элемента $a_{ij}$ — определитель."),
  entry("thm:laplace", "Теорема 5.11 (разложение по строке)", "Для любого $i$ верно…"),
  entry("rem:x", "Замечание 5.12", "Ёлка и миноры встречаются в тексте."),
]);

const LABELS: LabelIndex = {
  algebra: {
    "thm:laplace": {
      id: "thm:laplace",
      lecture: 5,
      name: "Теорема",
      number: "5.11",
      title: "разложение по строке",
      type: "theorem",
      weekId: "05_laplace",
    },
  },
};

describe("queryTerms", () => {
  it("lowercases, drops the ending of long words, keeps numbers whole", () => {
    expect(queryTerms("Миноры, теорема 5.11!")).toStrictEqual(["мино", "теоре", "5.11"]);
  });

  it("reads «ё» as «е»", () => {
    expect(queryTerms("ёлка")).toStrictEqual(["елка"]);
  });
});

describe("search", () => {
  it("puts the label with the exact number first", () => {
    const [first] = search(ENTRIES, LABELS, "5.11");
    expect(first?.anchor).toBe("thm:laplace");
    expect(first?.heading).toBe("Теорема 5.11 (разложение по строке)");
  });

  it("does not take 5.1 for 5.11", () => {
    expect(search(ENTRIES, LABELS, "5.1")).toStrictEqual([]);
  });

  it("ranks a heading match above a text match", () => {
    expect(search(ENTRIES, LABELS, "миноры").map((hit) => hit.anchor)).toStrictEqual([
      "sec:minors",
      "rem:x",
    ]);
  });

  it("needs every word and matches only at a word start", () => {
    expect(search(ENTRIES, LABELS, "минор строке")).toStrictEqual([]);
    expect(search(ENTRIES, LABELS, "инор")).toStrictEqual([]);
  });

  it("does not match the TeX of a formula", () => {
    expect(search(ENTRIES, LABELS, "a_")).toStrictEqual([]);
    expect(search(ENTRIES, LABELS, "ij")).toStrictEqual([]);
  });

  it("ignores an empty query", () => {
    expect(search(ENTRIES, LABELS, "  ")).toStrictEqual([]);
  });
});

describe("snippetOf", () => {
  it("marks whole matched words and keeps formulas", () => {
    expect(snippetOf("Минор элемента $a_{ij}$ — миноры", ["мино"])).toStrictEqual([
      { kind: "mark", value: "Минор" },
      { kind: "text", value: " элемента " },
      { kind: "math", value: "a_{ij}" },
      { kind: "text", value: " — " },
      { kind: "mark", value: "миноры" },
    ]);
  });

  it("never cuts a formula when it trims a long text", () => {
    const text = `${"слово ".repeat(20)}$x + y$ ${"слово ".repeat(40)}цель`;
    const parts = snippetOf(text, ["цель"]);
    expect(parts[0]).toStrictEqual({ kind: "text", value: "…" });
    expect(parts.some((part) => part.kind === "math" && part.value !== "x + y")).toBe(false);
    expect(parts.at(-1)).toStrictEqual({ kind: "mark", value: "цель" });
  });
});
