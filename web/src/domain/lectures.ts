import type { LectureEntry } from "./schemas.ts";

/** The newest lecture that has already taken place (ISO dates compare lexicographically); falls back to the first one. */
export const latestLecture = (
  lectures: readonly LectureEntry[],
  today: string,
): LectureEntry | undefined => {
  const happened = lectures.filter((lecture) => lecture.date <= today);
  return happened.at(-1) ?? lectures[0];
};

export const neighbours = (
  lectures: readonly LectureEntry[],
  weekId: string,
): { readonly next: LectureEntry | undefined; readonly prev: LectureEntry | undefined } => {
  const index = lectures.findIndex((lecture) => lecture.weekId === weekId);
  return index === -1
    ? { next: undefined, prev: undefined }
    : { next: lectures[index + 1], prev: lectures[index - 1] };
};
