import { describe, expect, it } from "vitest";

import type { LectureEntry } from "./schemas.ts";

import { latestLecture, neighbours } from "./lectures.ts";

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
