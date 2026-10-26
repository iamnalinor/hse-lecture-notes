import { describe, expect, it } from "vitest";

import { shortDate, todayIso } from "./dates.ts";

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
});
