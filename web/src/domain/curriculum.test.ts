import { describe, expect, it } from "vitest";

import { SAMPLE } from "#web/test/curriculum-fixture.ts";

import {
  barTitle,
  creditSums,
  currentModule,
  groupByCategory,
  hourRuns,
  hoursShare,
  intensity,
  maxHours,
  moduleTotals,
} from "./curriculum.ts";

describe("curriculum shaping", () => {
  it("sums the hours of every module and finds the scale top", () => {
    expect(moduleTotals(SAMPLE.disciplines)).toEqual([65, 60, 113, 93]);
    expect(maxHours(SAMPLE.disciplines)).toBe(44);
    expect(maxHours([])).toBe(0);
  });

  it("gives the share of a module in whole percent", () => {
    expect(hoursShare(28, 203)).toBe(14);
    expect(hoursShare(10, 0)).toBe(0);
  });

  it("scales the intensity by absolute hours and draws nothing for zero", () => {
    expect(intensity(0, 44)).toBe(0);
    expect(intensity(44, 44)).toBe(1);
    expect(intensity(22, 44)).toBeCloseTo(0.65);
    expect(intensity(100, 44)).toBe(1);
  });

  it("groups by category and drops empty groups", () => {
    expect(groupByCategory(SAMPLE).map((group) => group.category.id)).toEqual(["math", "prog"]);
  });

  it("orders a category like a Gantt chart: start, end, hours, name", () => {
    const rows = groupByCategory(SAMPLE).flatMap((group) => group.rows.map((row) => row.id));
    // prog: intro-se (modules 1–2), nis (1–3), gap (1–4), cpp (3–4)
    expect(rows).toEqual(["algebra", "intro-se", "nis", "gap", "cpp"]);
  });

  it("knows the current module only inside a known span", () => {
    expect(currentModule(SAMPLE, "2026-11-22")).toBe(2);
    expect(currentModule(SAMPLE, "2026-11-05")).toBe(2);
    expect(currentModule(SAMPLE, "2027-01-20")).toBeUndefined();
  });

  it("sums the credits: shown, with the hidden rows of the plan, with English", () => {
    // 8 + 3 + 4 + 5 + 1 shown; practice 3 and PE 0 are in the plan's total, English 8 is not
    expect(creditSums(SAMPLE)).toEqual({ shown: 21, withEnglish: 32, withHidden: 24 });
  });

  it("splits hours into runs of neighbouring modules", () => {
    expect(hourRuns([28, 28, 40, 40])).toEqual([{ end: 4, start: 0 }]);
    expect(hourRuns([9, 0, 9, 9])).toEqual([
      { end: 1, start: 0 },
      { end: 4, start: 2 },
    ]);
    expect(hourRuns([0, 0, 0, 0])).toEqual([]);
  });

  it("words the bar hint", () => {
    const [algebra, nis] = SAMPLE.disciplines;
    if (algebra === undefined || nis === undefined) {
      throw new Error("no rows");
    }
    expect(barTitle(algebra, 1, 203)).toBe("28 ч — 14% часов модуля · 8 кредитов за год");
    expect(barTitle(nis, 0, 183)).toContain("один из 11 семинаров");
  });
});
