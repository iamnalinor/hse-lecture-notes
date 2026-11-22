import { describe, expect, it } from "vitest";

import { SAMPLE } from "#web/test/curriculum-fixture.ts";

import {
  attestationText,
  barTitle,
  currentModule,
  groupByCategory,
  hoursShare,
  intensity,
  maxHours,
  moduleTotals,
} from "./curriculum.ts";

describe("curriculum shaping", () => {
  it("sums the hours of every module and finds the scale top", () => {
    expect(moduleTotals(SAMPLE.disciplines)).toEqual([38, 42, 64, 44]);
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

  it("knows the current module only inside a known span", () => {
    expect(currentModule(SAMPLE, "2026-11-22")).toBe(2);
    expect(currentModule(SAMPLE, "2026-11-05")).toBe(2);
    expect(currentModule(SAMPLE, "2027-01-20")).toBeUndefined();
  });

  it("words the attestation", () => {
    expect(attestationText([])).toBe("");
    expect(attestationText([3])).toBe("аттестация в 3 модуле");
    expect(attestationText([2, 4])).toBe("аттестация в 2 и 4 модулях");
    expect(attestationText([1, 2, 4])).toBe("аттестация в 1, 2 и 4 модулях");
  });

  it("words the bar hint", () => {
    const [algebra, nis] = SAMPLE.disciplines;
    if (algebra === undefined || nis === undefined) {
      throw new Error("no rows");
    }
    expect(barTitle(algebra, 1, 203)).toBe(
      "28 ч — 14% часов модуля · 8 кредитов за год · аттестация в 2 и 4 модулях",
    );
    expect(barTitle(nis, 0, 183)).toContain("один из 11 семинаров");
  });
});
