/** How Greek letters are read aloud in Russian lectures: a reader who meets «ξ» can find out it is «кси». */
const LETTERS: readonly (readonly [chars: readonly string[], name: string])[] = [
  [["α", "Α"], "альфа"],
  [["β", "Β"], "бета"],
  [["γ", "Γ"], "гамма"],
  [["δ", "Δ"], "дельта"],
  [["ε", "ϵ", "Ε"], "эпсилон"],
  [["ζ", "Ζ"], "дзета"],
  [["η", "Η"], "эта"],
  [["θ", "ϑ", "Θ"], "тета"],
  [["ι", "Ι"], "йота"],
  [["κ", "ϰ", "Κ"], "каппа"],
  [["λ", "Λ"], "лямбда"],
  [["μ", "Μ"], "мю"],
  [["ν", "Ν"], "ню"],
  [["ξ", "Ξ"], "кси"],
  [["ο", "Ο"], "омикрон"],
  [["π", "ϖ", "Π"], "пи"],
  [["ρ", "ϱ", "Ρ"], "ро"],
  [["σ", "ς", "Σ"], "сигма"],
  [["τ", "Τ"], "тау"],
  [["υ", "Υ", "ϒ"], "ипсилон"],
  [["φ", "ϕ", "Φ"], "фи"],
  [["χ", "Χ"], "хи"],
  [["ψ", "Ψ"], "пси"],
  [["ω", "Ω"], "омега"],
];

export const GREEK_NAMES: ReadonlyMap<string, string> = new Map(
  LETTERS.flatMap(([chars, name]) => chars.map((char) => [char, name] as const)),
);

/*
A plain loop, not `keys().some()`: iterator helpers are missing before Safari 18.4, and this runs for every formula.
*/
const hasGreek = (text: string): boolean => {
  for (const char of GREEK_NAMES.keys()) {
    if (text.includes(char)) {
      return true;
    }
  }
  return false;
};

const MATHML_END = "</math></span>";

const titleText = (text: string): string =>
  Array.from(text, (char) => {
    const name = GREEK_NAMES.get(char);
    return name === undefined ? char : `<span title="${name}">${char}</span>`;
  }).join("");

/** One piece of markup after a `<`: the tag up to `>`, then text; only the text is touched. */
const titlePiece = (piece: string): string => {
  const close = piece.indexOf(">");
  return close === -1 ? piece : piece.slice(0, close + 1) + titleText(piece.slice(close + 1));
};

/**
Wraps each Greek letter of KaTeX's visible output in a span with its Russian name as the tooltip. The MathML
copy for screen readers comes first in KaTeX's markup and is left as it is: it already names the symbol.
*/
export const withGreekTitles = (html: string): string => {
  const cut = html.indexOf(MATHML_END);
  const start = cut === -1 ? 0 : cut + MATHML_END.length;
  const visible = html.slice(start);
  return hasGreek(visible)
    ? html.slice(0, start) +
        visible
          .split("<")
          .map((piece) => titlePiece(piece))
          .join("<")
    : html;
};
