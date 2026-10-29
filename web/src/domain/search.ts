import type { LabelIndex, SearchEntry } from "./schemas.ts";

import { isCourseDoc } from "./course-docs.ts";
import { paths } from "./paths.ts";
import { isPrepId } from "./preps.ts";
import { splitTex } from "./text.ts";

/** A snippet of document text: formulas stay TeX, `mark` is a matched word. */
export type SnippetPart = { readonly kind: "mark" | "math" | "text"; readonly value: string };

export type SearchHit = {
  readonly anchor: string;
  readonly course: string;
  readonly doc: string;
  readonly heading: string;
  readonly lecture: number;
  readonly snippet: readonly SnippetPart[];
};

/** An entry with its lowercased text computed once per index, not once per keystroke. */
type PreparedEntry = SearchEntry & { readonly headingKey: string; readonly textKey: string };

export type PreparedIndex = {
  readonly byKey: ReadonlyMap<string, PreparedEntry>;
  readonly entries: readonly PreparedEntry[];
};

const MAX_HITS = 30;
const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 160;
const HEADING_WEIGHT = 3;
const MIN_STEM = 4;
const ENDING = 2;
const NUMBER = /^\d+\.\d+$/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Lowercase, «ё» as «е»: keeps the length, so offsets point into the original text. */
export const normalize = (text: string): string => text.toLowerCase().replaceAll("ё", "е");

/** Words longer than four letters lose the ending: «миноры» also finds «минор», «минора». */
const stem = (word: string): string =>
  NUMBER.test(word) || word.length <= MIN_STEM
    ? word
    : word.slice(0, Math.max(MIN_STEM, word.length - ENDING));

export const queryTerms = (query: string): readonly string[] =>
  normalize(query)
    .split(/[^\p{L}\p{N}.]+/u)
    .flatMap((word) => (NUMBER.test(word) ? word : word.split(".")))
    .filter((word) => word !== "")
    .map((word) => stem(word));

const isWordStart = (text: string, at: number): boolean =>
  at === 0 || !WORD_CHAR.test(text.charAt(at - 1));

/** First occurrence of `term` at the start of a word (a number must also end there), or -1. */
const findTerm = (text: string, term: string, from = 0): number => {
  const at = text.indexOf(term, from);
  if (at === -1) {
    return -1;
  }
  const isCutNumber = /\d/u.test(text.charAt(at + term.length)) && NUMBER.test(term);
  return !isCutNumber && isWordStart(text, at) ? at : findTerm(text, term, at + 1);
};

const firstMatch = (text: string, terms: readonly string[], from = 0): number => {
  const found = terms.map((term) => findTerm(text, term, from)).filter((at) => at !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
};

/** Search key: formulas blanked out (same length), so «x» or «frac» do not match TeX. */
const keyText = (text: string): string =>
  normalize(text).replaceAll(/\$[^$]*\$/gu, (formula) => " ".repeat(formula.length));

const keyOf = (hit: Pick<SearchHit, "anchor" | "course" | "doc">): string =>
  `${hit.course}/${hit.doc}#${hit.anchor}`;

export const prepareIndex = (raw: readonly SearchEntry[]): PreparedIndex => {
  const entries = raw.map((entry) => ({
    ...entry,
    headingKey: keyText(entry.heading),
    textKey: keyText(entry.text),
  }));
  return { byKey: new Map(entries.map((entry) => [keyOf(entry), entry])), entries };
};

const termScore = (entry: PreparedEntry, term: string): number => {
  if (findTerm(entry.headingKey, term) !== -1) {
    return HEADING_WEIGHT;
  }
  return findTerm(entry.textKey, term) === -1 ? 0 : 1;
};

/** Every word must be found; a word in the heading weighs more than one in the text. */
const scoreOf = (entry: PreparedEntry, terms: readonly string[]): number => {
  const scores = terms.map((term) => termScore(entry, term));
  return scores.includes(0) ? 0 : scores.reduce((sum, score) => sum + score, 0);
};

const wordEnd = (text: string, at: number): number => {
  const rest = text.slice(at).search(/[^\p{L}\p{N}.]/u);
  return rest === -1 ? text.length : at + rest;
};

/** Plain text with the matched words split out as `mark` parts. */
const markTerms = (text: string, terms: readonly string[], from = 0): readonly SnippetPart[] => {
  const at = firstMatch(normalize(text), terms, from);
  if (at === -1) {
    return from < text.length ? [{ kind: "text", value: text.slice(from) }] : [];
  }
  const end = wordEnd(text, at);
  const before: readonly SnippetPart[] =
    at > from ? [{ kind: "text", value: text.slice(from, at) }] : [];
  return [...before, { kind: "mark", value: text.slice(at, end) }, ...markTerms(text, terms, end)];
};

/** `[start, end)` grown so that it never cuts a `$…$` formula in half. */
const widenToFormulas = (text: string, start: number, end: number): readonly [number, number] => {
  const dollars = text
    .matchAll(/\$/gu)
    .map((match) => match.index)
    .toArray();
  const formulas = dollars.flatMap((open, index) =>
    index % 2 === 0 ? [[open, (dollars[index + 1] ?? text.length - 1) + 1] as const] : [],
  );
  const cutStart = formulas.find(([open, close]) => open < start && start < close);
  const cutEnd = formulas.find(([open, close]) => open < end && end < close);
  return [cutStart?.[0] ?? start, cutEnd?.[1] ?? end];
};

export const snippetOf = (text: string, terms: readonly string[]): readonly SnippetPart[] => {
  const first = Math.max(0, firstMatch(keyText(text), terms));
  const [start, end] = widenToFormulas(
    text,
    Math.max(0, first - SNIPPET_BEFORE),
    first + SNIPPET_LENGTH,
  );
  const body = splitTex(text.slice(start, end)).flatMap((part) =>
    part.kind === "math" ? [part] : markTerms(part.value, terms),
  );
  return [
    ...(start > 0 ? [{ kind: "text", value: "…" } as const] : []),
    ...body,
    ...(end < text.length ? [{ kind: "text", value: "…" } as const] : []),
  ];
};

const entryHit = (entry: PreparedEntry, terms: readonly string[]): SearchHit => ({
  anchor: entry.anchor,
  course: entry.course,
  doc: entry.doc,
  heading: entry.heading,
  lecture: entry.lecture,
  snippet: entry.text === "" ? [] : snippetOf(entry.text, terms),
});

/** «4.3» (and «теорема 4.3»): the labels with exactly that number, in every course. */
const numberHits = (
  labels: LabelIndex,
  terms: readonly string[],
  entries: ReadonlyMap<string, PreparedEntry>,
): readonly SearchHit[] => {
  const numbers = new Set(terms.filter((term) => NUMBER.test(term)));
  const words = terms.filter((term) => !NUMBER.test(term));
  return Object.entries(labels).flatMap(([course, byId]) =>
    Object.values(byId)
      .filter((label) => numbers.has(label.number))
      .filter((label) => {
        const name = normalize(`${label.name} ${label.title}`);
        return words.every((word) => findTerm(name, word) !== -1);
      })
      .map((label): SearchHit => {
        const entry = entries.get(`${course}/${label.weekId}#${label.id}`);
        const title = label.title === "" ? "" : ` (${label.title})`;
        return {
          anchor: label.id,
          course,
          doc: label.weekId,
          heading: entry?.heading ?? `${label.name} ${label.number}${title}`,
          lecture: label.lecture,
          snippet: entry === undefined || entry.text === "" ? [] : snippetOf(entry.text, words),
        };
      }),
  );
};

/** Labels by number first, then sections and blocks by score (document order on a tie). */
export const search = (
  { byKey, entries }: PreparedIndex,
  labels: LabelIndex,
  query: string,
): readonly SearchHit[] => {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return [];
  }
  const byNumber = numberHits(labels, terms, byKey);
  const seen = new Set(byNumber.map((hit) => keyOf(hit)));
  const scored = entries
    .map((entry) => ({ entry, score: scoreOf(entry, terms) }))
    .filter(({ entry, score }) => score > 0 && !seen.has(keyOf(entry)))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_HITS)
    .map(({ entry }) => entryHit(entry, terms));
  return [...byNumber, ...scored].slice(0, MAX_HITS);
};

export const hitPath = (hit: SearchHit): string => {
  if (isCourseDoc(hit.doc)) {
    return paths[hit.doc](hit.course, hit.anchor);
  }
  return isPrepId(hit.doc)
    ? paths.prep(hit.course, hit.doc, hit.anchor)
    : paths.lecture(hit.course, hit.doc, hit.anchor);
};
