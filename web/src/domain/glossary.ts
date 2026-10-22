import type { GlossaryEntry, LectureEntry } from "./schemas.ts";

import { stripTags } from "./text.ts";

export type GlossaryGroup = {
  readonly entries: readonly GlossaryEntry[];
  readonly lecture: number;
  /** Lecture topic; empty when the catalog does not know the lecture. */
  readonly title: string;
  readonly weekId: string;
};

export const isGlossaryMatch = (entry: GlossaryEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" || `${entry.term} ${stripTags(entry.defHtml)}`.toLowerCase().includes(needle)
  );
};

/** Formulas and symbols (`\det A`) sort before words. */
const sortKey = (term: string): string => (/^\p{L}/u.test(term.trim()) ? `1${term}` : `0${term}`);

/** Groups by lecture (in lecture order), alphabetical inside a lecture. */
export const groupGlossary = (
  entries: readonly GlossaryEntry[],
  lectures: readonly LectureEntry[],
): readonly GlossaryGroup[] => {
  const numbers = [...new Set(entries.map((entry) => entry.lecture))].toSorted((a, b) => a - b);
  return numbers.map((lecture) => {
    const own = entries.filter((entry) => entry.lecture === lecture);
    const known = lectures.find((item) => item.lecture === lecture);
    return {
      entries: own.toSorted((a, b) => sortKey(a.term).localeCompare(sortKey(b.term), "ru")),
      lecture,
      title: known?.title ?? "",
      weekId: known?.weekId ?? own[0]?.weekId ?? "",
    };
  });
};
