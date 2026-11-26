import { describe, expect, it } from "vitest";

import {
  barTitle,
  creditSums,
  currentModule,
  groupByCategory,
  hourRuns,
  hoursPerWeek,
  hoursShare,
  intensity,
  loadText,
  maxLoad,
  moduleDays,
  moduleTotals,
  moduleWeeks,
  todayInModule,
} from "#web/domain/curriculum.ts";

import { SAMPLE } from "../support/curriculum-fixture.ts";

describe("curriculum shaping", () => {
  it("sums the hours of every module and finds the scale top", () => {
    expect(moduleTotals(SAMPLE.disciplines)).toEqual([65, 60, 113, 93]);
  });

  it("takes the module lengths only when all four are known", () => {
    expect(moduleWeeks(SAMPLE)).toEqual([7.9, 7.1, 10.7, 10.6]);
    expect(moduleWeeks({ ...SAMPLE, moduleSpans: SAMPLE.moduleSpans.slice(1) })).toBeUndefined();
  });

  it("measures the load in hours per week, plain hours without the lengths", () => {
    const weeks = moduleWeeks(SAMPLE);
    expect(hoursPerWeek(28, 1, weeks)).toBeCloseTo(3.94, 2);
    expect(hoursPerWeek(28, 1, undefined)).toBe(28);
    // algebra: 28/7.9 = 3.54, 28/7.1 = 3.94, 44/10.7 = 4.11, 44/10.6 = 4.15; intro-se 18/7.1 = 2.5
    expect(maxLoad(SAMPLE.disciplines, weeks)).toBeCloseTo(44 / 10.6, 5);
    expect(maxLoad(SAMPLE.disciplines, undefined)).toBe(44);
    expect(maxLoad([], weeks)).toBe(0);
  });

  it("makes a longer module with the same hours less intense", () => {
    const weeks = moduleWeeks(SAMPLE);
    const top = maxLoad(SAMPLE.disciplines, weeks);
    // 40 hours in a 7.1-week module is heavier than 40 hours in a 10.6-week one
    expect(intensity(hoursPerWeek(40, 1, weeks), top)).toBeGreaterThan(
      intensity(hoursPerWeek(40, 3, weeks), top),
    );
  });

  it("writes the load with a decimal comma", () => {
    expect(loadText(3.94)).toBe("3,9");
    expect(loadText(4)).toBe("4,0");
  });

  it("gives the share of a module in whole percent", () => {
    expect(hoursShare(28, 203)).toBe(14);
    expect(hoursShare(10, 0)).toBe(0);
  });

  it("scales the intensity by load and draws nothing for zero", () => {
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
    expect(currentModule(SAMPLE, "2026-12-30")).toBe(2);
    expect(currentModule(SAMPLE, "2027-01-05")).toBeUndefined();
  });

  it("measures modules in calendar days, sessions included, for the column widths", () => {
    expect(moduleDays(SAMPLE)).toEqual([61, 56, 82, 91]);
    expect(moduleDays({ ...SAMPLE, moduleSpans: SAMPLE.moduleSpans.slice(1) })).toBeUndefined();
  });

  it("puts today in the middle of its day inside the module, nowhere between modules", () => {
    expect(todayInModule(SAMPLE, "2026-11-05")).toEqual({ fraction: 0.5 / 56, module: 2 });
    expect(todayInModule(SAMPLE, "2026-12-30")).toEqual({ fraction: 55.5 / 56, module: 2 });
    expect(todayInModule(SAMPLE, "2027-01-05")).toBeUndefined();
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
    const weeks = moduleWeeks(SAMPLE);
    const totals = [183, 203, 290, 282];
    expect(barTitle(algebra, 1, { totals, weeks })).toBe(
      "28 ч · 3,9 ч/нед — 14% часов модуля · 8 кредитов за год",
    );
    expect(barTitle(algebra, 1, { totals, weeks: undefined })).toBe(
      "28 ч — 14% часов модуля · 8 кредитов за год",
    );
    expect(barTitle(nis, 0, { totals, weeks })).toContain("один из 11 семинаров");
  });
});
