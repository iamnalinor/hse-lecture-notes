/** Markup removed, for plain-text search. */
export const stripTags = (html: string): string =>
  html
    .split("<")
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(">") + 1)))
    .join(" ");

const CHARS_PER_MINUTE = 900;

/** Rough reading time of an HTML document, in whole minutes. */
export const readingMinutes = (html: string): number =>
  Math.ceil(stripTags(html).length / CHARS_PER_MINUTE);

/** Russian plural form: `plural(3, ["конспект", "конспекта", "конспектов"])` → «конспекта». */
export const plural = (n: number, forms: readonly [string, string, string]): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) {
    return forms[2];
  }
  const ones = n % 10;
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
