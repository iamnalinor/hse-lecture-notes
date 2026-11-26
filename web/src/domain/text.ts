/** Markup removed, for plain-text search. */
export const stripTags = (html: string): string =>
  html
    .split("<")
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(">") + 1)))
    .join(" ");

/**
Study reading speed, words of prose per minute. Sources:
- IReST (Trauzettel-Klosinski & Dietz 2012, IOVS, Table 2): Russian is read aloud at 184 wpm; Table 1:
  a Russian text needs about 0.82 times the words of the same English one (126.5 vs 153.5 words per text).
- Brysbaert 2019 (J. Memory & Language): 238 wpm silent for English non-fiction. Scaled to Russian
  (words in Russian are longer, a text has fewer of them): 238 * 0.82 = about 195 wpm silent.
- Carver's «learning» gear (reading to remember) runs at about 2/3 of the normal speed: 195 * 2/3 = about 130 wpm.
The weights of a formula are our estimate, not measured: an inline one costs as much as two words,
a display one as ten (it is read, parsed and often checked on paper).
*/
const WORDS_PER_MINUTE = 130;
const INLINE_FORMULA_WORDS = 2;
const DISPLAY_FORMULA_WORDS = 10;

/** `<span class="math inline|display">TeX source</span>`: the source is escaped text, so it holds no tags. */
const INLINE_MATH_RE = /<span class="math inline">[^<]*<\/span>/gu;
const DISPLAY_MATH_RE = /<span class="math display">[^<]*<\/span>/gu;
const BLOCK_TAGS = new Set(
  "p li ul ol h1 h2 h3 h4 h5 h6 div br tr td th dd dt dl section figure figcaption blockquote pre details summary".split(
    " ",
  ),
);

/** Text of a document with the markup removed: a block tag separates words, an inline one (`<em>`, `<a>`) does not. */
const proseText = (html: string): string =>
  html
    .split("<")
    .map((part, index) => {
      if (index === 0) {
        return part;
      }
      const end = part.indexOf(">");
      const name = part.slice(0, end).replace(/^\//u, "").split(/[\s/]/u, 1)[0] ?? "";
      return `${BLOCK_TAGS.has(name.toLowerCase()) ? " " : ""}${part.slice(end + 1)}`;
    })
    .join("");

/** Rough reading time of an HTML document, in whole minutes: prose words plus the weight of the formulas. */
export const readingMinutes = (html: string): number => {
  const inline = html.matchAll(INLINE_MATH_RE).toArray().length;
  const display = html.matchAll(DISPLAY_MATH_RE).toArray().length;
  const text = proseText(html.replaceAll(INLINE_MATH_RE, "").replaceAll(DISPLAY_MATH_RE, ""));
  const words = text.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const total = words + inline * INLINE_FORMULA_WORDS + display * DISPLAY_FORMULA_WORDS;
  return Math.ceil(total / WORDS_PER_MINUTE);
};

/**
Russian plural form: `plural(3, ["конспект", "конспекта", "конспектов"])` → «конспекта». A fraction
takes the genitive singular, the second form («1,5 часа», «0,5 балла»); the sign does not matter.
*/
export const plural = (n: number, forms: readonly [string, string, string]): string => {
  if (!Number.isSafeInteger(n)) {
    return forms[1];
  }
  const tens = Math.abs(n) % 100;
  if (tens >= 11 && tens <= 14) {
    return forms[2];
  }
  const ones = Math.abs(n) % 10;
  if (ones === 1) {
    return forms[0];
  }
  return ones >= 2 && ones <= 4 ? forms[1] : forms[2];
};

const KB = 1024;
const MB = KB * KB;
const ONE_DECIMAL = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** Download size for people: «840 КБ», «3,3 МБ». */
export const formatSize = (bytes: number): string =>
  bytes < MB
    ? `${String(Math.max(1, Math.round(bytes / KB)))} КБ`
    : `${ONE_DECIMAL.format(bytes / MB)} МБ`;

export type TexPart = { readonly kind: "math" | "text"; readonly value: string };

/** Plain text with inline `$…$` formulas (label titles in `index.json`) split into parts. */
export const splitTex = (text: string): readonly TexPart[] =>
  text
    .split(/(\$[^$]+\$)/u)
    .filter((part) => part !== "")
    .map((part) =>
      part.length > 2 && part.startsWith("$") && part.endsWith("$")
        ? { kind: "math", value: part.slice(1, -1) }
        : { kind: "text", value: part },
    );
