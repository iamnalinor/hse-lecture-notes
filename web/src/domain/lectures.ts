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

const WEEK_NUMBER = /^(?<number>\d{2})_[a-z]{3}\d{2}(?:_|$)/u;

/**
The lecture a `week_id` from a URL points to. Slugs (and dates) get renamed when they stop matching
the lecture, so a saved link may name a `week_id` that no longer exists: then the lecture with the
same number (`NN`) is taken. `exact` is false for such a guess, so the page can redirect to the
current address.
*/
export const resolveLecture = (
  lectures: readonly LectureEntry[],
  weekId: string,
): undefined | { readonly entry: LectureEntry; readonly exact: boolean } => {
  const found = lectures.find((lecture) => lecture.weekId === weekId);
  if (found !== undefined) {
    return { entry: found, exact: true };
  }
  const number = WEEK_NUMBER.exec(weekId)?.groups?.["number"];
  const guess =
    number === undefined
      ? undefined
      : lectures.find((lecture) => lecture.lecture === Number(number));
  return guess === undefined ? undefined : { entry: guess, exact: false };
};
