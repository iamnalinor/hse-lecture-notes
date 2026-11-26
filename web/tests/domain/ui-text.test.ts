import { describe, expect, it } from "vitest";

/** Every source file of the app as text. */
const SOURCES = import.meta.glob<string>("../../src/**/*.{json,ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

/** Every word of the sources, lowercase, with its file. */
const WORDS = Object.entries(SOURCES)
  // search.ts normalises «ё» → «е» in code: the letter is the data there
  .filter(([file]) => !file.endsWith("/domain/search.ts"))
  .flatMap(([file, text]) =>
    text
      .matchAll(/\p{L}+/gu)
      .map((match) => ({
        file: file.replace("../../src/", ""),
        word: match[0].toLowerCase(),
      }))
      .toArray(),
  );

/** «ё» only where «е» changes the meaning (`context/style/writing-ru.md`, Т27), and in proper names. */
const YO_WORDS = new Set([
  "всё",
  "всём",
  "её",
  "неё",
  "нём",
  "чём",
  "трём",
  "узнаём",
  "узнаёт",
  "нёбо",
  "рёбра",
  "пётр",
  "шрёдер",
]);
const YO_STEMS = ["совершённ", "чёрч", "эрдёш", "кёниг"];

const isAllowedYo = (word: string): boolean =>
  YO_WORDS.has(word) || YO_STEMS.some((stem) => word.startsWith(stem));

const YOU_PLURAL = new Set(["вы", "вас", "вам", "вами", "ваш", "ваша", "ваше", "ваши", "вашу"]);

describe("UI text", () => {
  it("scans the sources", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(WORDS.length).toBeGreaterThan(10_000);
  });

  it("writes «ё» only in the words Т27 allows", () => {
    const bad = WORDS.filter(({ word }) => word.includes("ё") && !isAllowedYo(word));
    expect(bad.map(({ file, word }) => `${file}: ${word}`)).toEqual([]);
  });

  it("addresses the user as «ты», never «вы»", () => {
    const bad = WORDS.filter(({ word }) => YOU_PLURAL.has(word));
    expect(bad.map(({ file, word }) => `${file}: ${word}`)).toEqual([]);
  });
});
