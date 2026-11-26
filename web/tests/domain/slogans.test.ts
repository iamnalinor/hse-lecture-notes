import { describe, expect, it } from "vitest";

import { shuffledRound, SLOGANS, toChunks, toWords } from "#web/domain/slogans.ts";

describe("toWords", () => {
  it("glues a leading comma to the previous word, so it cannot wrap alone", () => {
    const words = toWords([
      ["Читай конспект", true],
      [", а не фотографии доски", false],
    ]);
    expect(words.map((w) => w.text + w.trail)).toEqual([
      "Читай",
      "конспект,",
      "а",
      "не",
      "фотографии",
      "доски",
    ]);
    expect(words[1]).toMatchObject({ accent: true, trail: "," });
    expect(words[2]).toMatchObject({ accent: false, trail: "" });
  });

  it("keeps the dash as a word of its own", () => {
    const words = toWords([
      ["Чат с ответом на вопрос — ", false],
      ["в двух кликах", true],
    ]);
    expect(words.map((w) => w.text)).toContain("—");
  });

  it("numbers the words without gaps", () => {
    const words = toWords(SLOGANS[1] ?? []);
    expect(words.map((w) => w.key)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

const chunks = (index: number) =>
  toChunks(toWords(SLOGANS[index] ?? [])).map((chunk) =>
    chunk.map((w) => w.text + w.trail).join(" "),
  );

describe("toChunks", () => {
  it("keeps short function words with the next word", () => {
    expect(chunks(1)).toEqual(["Читай", "конспект,", "а не фотографии", "доски"]);
    expect(chunks(13)).toEqual(["Повторить", "тему", "в метро"]);
  });

  it("keeps the dash with the word before it and a one-letter word with the next one", () => {
    expect(chunks(3)).toEqual(["Чат", "с ответом", "на вопрос —", "в двух", "кликах"]);
  });

  it("glues short words in the lecturer slogan and colours the comma with the first part", () => {
    expect(chunks(14)).toEqual(["Определения", "и доказательства,", "как", "у лектора"]);
    expect(toWords(SLOGANS[14] ?? []).find((w) => w.trail === ",")).toMatchObject({
      accent: true,
      text: "доказательства",
    });
  });

  it("does not glue a word that ends with punctuation", () => {
    const words = toWords([
      ["Что, ", false],
      ["где", true],
    ]);
    expect(words.map((w) => w.glue)).toEqual([false, false]);
  });

  it("colours the comma together with an accent word", () => {
    const words = toWords(SLOGANS[7] ?? []);
    expect(words.find((w) => w.trail === ",")).toMatchObject({ accent: true, text: "определение" });
  });
});

describe("shuffledRound", () => {
  it("contains every slogan except the current one, once", () => {
    const round = shuffledRound(3, SLOGANS.length);
    expect(round).not.toContain(3);
    expect(new Set(round).size).toBe(SLOGANS.length - 1);
  });

  it("is a permutation driven by the injected random", () => {
    expect(shuffledRound(0, 4, () => 0.5)).toEqual([1, 2, 3]);
    let n = 0;
    expect(shuffledRound(0, 4, () => 1 - 0.1 * ++n)).toEqual([3, 2, 1]);
  });
});
