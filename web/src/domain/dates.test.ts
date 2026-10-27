import { describe, expect, it } from "vitest";

import { addDays, dayMonth, shortDate, todayIso } from "./dates.ts";

describe("dates", () => {
  it("shortens an ISO date to day.month", () => {
    expect(shortDate("2026-10-14")).toBe("14.10");
  });

  it("leaves garbage as it is", () => {
    expect(shortDate("скоро")).toBe("скоро");
  });

  it("formats today as ISO", () => {
    expect(todayIso(new Date("2026-10-15T08:30:00Z"))).toBe("2026-10-15");
  });

  it("starts the day at midnight in Moscow, not in UTC", () => {
    expect(todayIso(new Date("2026-10-24T21:30:00Z"))).toBe("2026-10-25");
    expect(todayIso(new Date("2026-10-24T20:59:00Z"))).toBe("2026-10-24");
  });

  it.each([
    ["2026-10-23", "23 окт"],
    ["2026-09-04", "4 сен"],
    ["2027-05-01", "1 мая"],
    ["скоро", "скоро"],
  ])("names the day of %s as %s", (iso, expected) => {
    expect(dayMonth(iso)).toBe(expected);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-11-02", -14)).toBe("2026-10-19");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("not a date", -14)).toBe("not a date");
    expect(addDays("2027-03-10", -14)).toBe("2027-02-24");
  });
});
