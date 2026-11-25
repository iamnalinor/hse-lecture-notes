import { z } from "zod";

import { COURSES } from "./courses.ts";
import { isDocumentPath } from "./paths.ts";

/** Router state attached to a cross-reference jump, so the target can offer a way back. */
export const BackStateSchema = z.object({ backLabel: z.string() });

export type BackPlace = {
  /** Label of the block the link stood in: «Теорема 6.11». */
  readonly block: string | undefined;
  /** Number of the section the link stood in. */
  readonly section: string | undefined;
};

/** Where the reader jumped from: the block if there was one, else the section, else just «ссылка». */
export const backLabel = (place: BackPlace, fromLecture: number | undefined): string => {
  const where = place.block ?? (place.section === undefined ? "ссылка" : `§ ${place.section}`);
  return fromLecture === undefined ? where : `${where}, лекция ${String(fromLecture)}`;
};

const DOC_KINDS: readonly (readonly [RegExp, (n: string) => string])[] = [
  [/^(\d{2})_/u, (n) => `лекция ${String(Number(n))}`],
  [/^kr(\d+)$/u, (n) => `КР ${n}`],
  [/^colloq(\d+)$/u, (n) => `коллоквиум ${n}`],
  [/^exam(\d+)$/u, (n) => `экзамен ${n}`],
  [/^theory$/u, () => "теория"],
  [/^program$/u, () => "программа"],
  [/^quiz-/u, () => "квиз"],
];

/**
The page a reader left for another document by an ordinary link: «Алгебра, лекция 3». Undefined
unless both are document pages of a course, so lists and the home page get no «Назад» bar.
*/
export const documentBackLabel = (from: string, to: string): string | undefined => {
  if (!isDocumentPath(from) || !isDocumentPath(to)) {
    return undefined;
  }
  const [course = "", doc = ""] = from.split("/").filter((part) => part !== "");
  const info = COURSES.find((item) => item.id === course);
  if (info === undefined) {
    return undefined;
  }
  for (const [pattern, name] of DOC_KINDS) {
    const match = pattern.exec(doc);
    if (match !== null) {
      return `${info.short}, ${name(match[1] ?? "")}`;
    }
  }
  return info.short;
};
