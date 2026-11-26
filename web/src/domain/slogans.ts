/** One slogan is a list of parts; the part flagged `true` is the main idea and is highlighted. */
export type Part = readonly [text: string, accent: boolean];
export type Slogan = readonly Part[];

/**
Home-page slogans. The first one is the static one: it is what the page shows on load, what crawlers
and clients without JS see. The rest are shown in random order afterwards.
Rules (context/style/writing-ru.md): no evaluation words, no promises the site does not keep.
*/
export const SLOGANS: readonly Slogan[] = [
  [
    ["Конспекты лекций, ", false],
    ["которые интересно читать", true],
  ],
  [
    ["Читай конспект", true],
    [", а не фотографии доски", false],
  ],
  [
    ["Заботать коллоквиум ", false],
    ["за сутки", true],
  ],
  [
    ["Чат с ответом на вопрос — ", false],
    ["в двух кликах", true],
  ],
  [
    ["Забыл определение? ", false],
    ["Наведи на номер", true],
  ],
  [
    ["Теорема, доказательство, ", false],
    ["разобранный пример", true],
  ],
  [
    ["Демо-вариант КР", true],
    [", чтобы подготовиться", false],
  ],
  [
    ["Найти определение", true],
    [", а не листать PDF", false],
  ],
  [
    ["Чат с ИИ ", false],
    ["на каждой странице", true],
  ],
  [
    ["Пропустил лекцию? ", false],
    ["Читай конспект", true],
  ],
  [
    ["Проспал пару, ", false],
    ["а не новую тему", true],
  ],
  [
    ["Разобраться в теме ", false],
    ["после лекции", true],
  ],
  [
    ["Ботать ", false],
    ["даже без связи", true],
  ],
  [
    ["Повторить тему ", false],
    ["в метро", true],
  ],
  [
    ["Определения и доказательства", true],
    [", как у лектора", false],
  ],
];

export type Word = {
  readonly accent: boolean;
  /** Keep this word on one line with the next one (short function word, or the next word is a dash). */
  readonly glue: boolean;
  readonly key: number;
  readonly text: string;
  readonly trail: string;
};

const PUNCTUATION = ",.?!:;";
const DASH = "—";

/** Short prepositions, conjunctions and particles: they must not be left at the end of a line. */
const SHORT_WORDS = new Set([
  "а",
  "бы",
  "в",
  "во",
  "да",
  "до",
  "за",
  "и",
  "из",
  "к",
  "ко",
  "ли",
  "на",
  "не",
  "ни",
  "но",
  "о",
  "об",
  "от",
  "по",
  "с",
  "со",
  "у",
  "же",
]); // prettier-ignore

const hasLeadingPunctuation = (text: string) => text !== "" && PUNCTUATION.includes(text.charAt(0));

/**
Splits a slogan into words for per-word animation. Punctuation that opens a part (", а не…") is glued to the
previous word as its `trail` and takes its colour: otherwise it becomes a separate inline-block and can wrap onto
the next line alone. Short function words and the dash get `glue` (see `toChunks`).
*/
export const toWords = (slogan: Slogan): Word[] => {
  const words = slogan.flatMap(([raw, accent], part) => {
    const text = part > 0 && hasLeadingPunctuation(raw) ? raw.slice(1) : raw;
    const following = slogan[part + 1]?.[0] ?? "";
    const trail = hasLeadingPunctuation(following) ? following.charAt(0) : "";
    const parts = text.split(/\s+/u).filter(Boolean);
    return parts.map((word, i) => ({
      accent,
      text: word,
      trail: i === parts.length - 1 ? trail : "",
    }));
  });
  return words.map((word, key) => ({
    ...word,
    glue:
      key < words.length - 1 &&
      ((word.trail === "" && SHORT_WORDS.has(word.text.toLowerCase())) ||
        words[key + 1]?.text === DASH),
    key,
  }));
};

/**
Groups words that must stay on one line: a glued word and the one after it share a chunk. In the DOM a chunk is a
`white-space: nowrap` span whose words are joined by a no-break space (U+00A0), so copying the text keeps it too.
*/
export const toChunks = (words: readonly Word[]): Word[][] => {
  const starts = words.map((_, i) => i).filter((i) => i === 0 || words[i - 1]?.glue === false);
  return starts.map((start, k) => words.slice(start, starts[k + 1] ?? words.length));
};

/** Every slogan index except `current`, in random order. `random` is injectable for tests. */
export const shuffledRound = (
  current: number,
  count: number,
  random: () => number = Math.random,
): number[] =>
  Array.from({ length: count }, (_, i) => i)
    .filter((i) => i !== current)
    .map((index) => ({ index, order: random() }))
    .toSorted((a, b) => a.order - b.order)
    .map(({ index }) => index);
