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

const WEEK_ID = /^(?<number>\d{2})_(?<day>[a-z]{3}\d{2})(?:_|$)/u;

const dayOf = (weekId: string): string | undefined => WEEK_ID.exec(weekId)?.groups?.["day"];

/**
The lecture a `week_id` from a URL points to. Slugs get renamed when they stop matching the lecture,
so a saved link may name a slug that no longer exists: then the lecture of the same date (`mmmDD`)
is taken, and if the date moved too — the one with the same number (`NN`). `exact` is false for such
a guess, so the page can redirect to the current address.
*/
export const resolveLecture = (
  lectures: readonly LectureEntry[],
  weekId: string,
): undefined | { readonly entry: LectureEntry; readonly exact: boolean } => {
  const found = lectures.find((lecture) => lecture.weekId === weekId);
  if (found !== undefined) {
    return { entry: found, exact: true };
  }
  const wanted = WEEK_ID.exec(weekId)?.groups;
  if (wanted === undefined) {
    return undefined;
  }
  const only = (matches: readonly LectureEntry[]): LectureEntry | undefined =>
    matches.length === 1 ? matches[0] : undefined;
  const guess =
    only(lectures.filter((lecture) => dayOf(lecture.weekId) === wanted["day"])) ??
    only(lectures.filter((lecture) => lecture.lecture === Number(wanted["number"])));
  return guess === undefined ? undefined : { entry: guess, exact: false };
};
