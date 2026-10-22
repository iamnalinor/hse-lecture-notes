import type { LectureEntry, PrepEntry } from "#web/domain/schemas.ts";

import { type CourseInfo, findCourse } from "#web/domain/courses.ts";

import { useCatalog } from "./queries.ts";

export type CourseData = {
  readonly info: CourseInfo;
  readonly lectures: readonly LectureEntry[];
  readonly preps: readonly PrepEntry[];
};

/** A 404 for the router's error boundary (see `app/not-found.ts`). */
export const notFound = (): never => {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Router's contract for a 404
  throw new Response("Not Found", { status: 404 });
};

/** A route param → the course; an unknown course is a 404. */
export const useCourse = (id: string | undefined): CourseData => {
  const catalog = useCatalog();
  const info = findCourse(id);
  const lectures = info === undefined ? undefined : catalog.lectures[info.id];
  return info === undefined || lectures === undefined
    ? notFound()
    : { info, lectures, preps: catalog.preps[info.id] ?? [] };
};
