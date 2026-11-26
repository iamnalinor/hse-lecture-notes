import { renderToString } from "katex";
import { expect, it } from "vitest";

import { GREEK_NAMES, withGreekTitles } from "#web/domain/greek.ts";

it("names every Greek letter in a formula on hover, both forms of epsilon and phi too", () => {
  const html = withGreekTitles(
    renderToString(String.raw`\varepsilon + \epsilon \Delta x \varphi\phi`),
  );
  const titles = Array.from(
    html.matchAll(/title="([^"]+)">(.)</gu),
    ([, title, char]) => `${char}:${title}`,
  );
  expect(titles).toEqual(["ε:эпсилон", "ϵ:эпсилон", "Δ:дельта", "φ:фи", "ϕ:фи"]);
});

it("leaves the MathML copy and formulas without Greek letters as they are", () => {
  const plain = renderToString("x^2 + 1");
  expect(withGreekTitles(plain)).toBe(plain);
  const html = withGreekTitles(renderToString(String.raw`\alpha`));
  expect(html).toContain("<mi>α</mi>");
});

it("names the whole alphabet, capitals and variant forms included", () => {
  const names = [
    "альфа",
    "бета",
    "гамма",
    "дельта",
    "эпсилон",
    "дзета",
    "эта",
    "тета",
    "йота",
    "каппа",
    "лямбда",
    "мю",
    "ню",
    "кси",
    "омикрон",
    "пи",
    "ро",
    "сигма",
    "тау",
    "ипсилон",
    "фи",
    "хи",
    "пси",
    "омега",
  ];
  const lower = Array.from("αβγδεζηθικλμνξοπρστυφχψω", (char) => GREEK_NAMES.get(char));
  const upper = Array.from("ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ", (char) => GREEK_NAMES.get(char));
  const variants = Array.from("ϵϑϰϖϱςϕϒ", (char) => GREEK_NAMES.get(char));
  expect(lower).toEqual(names);
  expect(upper).toEqual(names);
  expect(variants).toEqual(["эпсилон", "тета", "каппа", "пи", "ро", "сигма", "фи", "ипсилон"]);
});
