import { describe, expect, it } from "vitest";

import type { LectureEntry } from "./schemas.ts";

import { latestLecture, neighbours, resolveLecture } from "./lectures.ts";

const lecture = (n: number, date: string): LectureEntry => ({
  date,
  lecture: n,
  title: `Лекция ${String(n)}`,
  weekId: `0${String(n)}`,
});

const FIRST = lecture(1, "2026-10-01");
const SECOND = lecture(2, "2026-10-08");
const THIRD = lecture(3, "2026-10-14");
const FOURTH = lecture(4, "2026-10-21");
const ALL = [FIRST, SECOND, THIRD, FOURTH];

describe("lecture lists", () => {
  it("finds the newest lecture that already happened", () => {
    expect(latestLecture(ALL, "2026-10-15")?.lecture).toBe(3);
  });

  it("counts the lecture day itself as happened", () => {
    expect(latestLecture(ALL, "2026-10-21")?.lecture).toBe(4);
  });

  it("falls back to the first lecture before the term starts", () => {
    expect(latestLecture(ALL, "2026-09-01")?.lecture).toBe(1);
  });

  it("gives neighbours at both ends", () => {
    expect(neighbours(ALL, "01")).toEqual({ next: SECOND, prev: undefined });
    expect(neighbours(ALL, "04")).toEqual({ next: undefined, prev: THIRD });
    expect(neighbours(ALL, "nope")).toEqual({ next: undefined, prev: undefined });
  });
});

const named = (n: number, weekId: string): LectureEntry => ({
  date: "2026-11-11",
  lecture: n,
  title: `Лекция ${String(n)}`,
  weekId,
});

describe("resolving a week_id from a URL", () => {
  const LECTURES = [
    named(9, "09_nov05_homogeneous_systems"),
    named(10, "10_nov11_solutions_complex_numbers"),
    named(11, "11_nov20_complex_trig_roots"),
  ];

  it("takes the exact week_id as is", () => {
    expect(resolveLecture(LECTURES, "09_nov05_homogeneous_systems")).toEqual({
      entry: LECTURES[0],
      exact: true,
    });
  });

  it("falls back to the lecture of the same date when the slug was renamed", () => {
    expect(resolveLecture(LECTURES, "10_nov11_solution_structure")).toEqual({
      entry: LECTURES[1],
      exact: false,
    });
  });

  it("falls back to the lecture number when the date moved too", () => {
    expect(resolveLecture(LECTURES, "11_nov18_complex_trig_form")?.entry).toBe(LECTURES[2]);
  });

  it("finds nothing for a week_id of an unknown shape or lecture", () => {
    expect(resolveLecture(LECTURES, "theory-old")).toBeUndefined();
    expect(resolveLecture(LECTURES, "12_dec02_cross_product")).toBeUndefined();
  });
});
