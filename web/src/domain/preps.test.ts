import { describe, expect, it } from "vitest";

import { isPrepId, prepName, upcomingPreps } from "./preps.ts";

describe("test preparation pages", () => {
  it.each([
    ["kr1", true],
    ["kr12", true],
    ["theory", false],
    ["01_sep04_logic", false],
  ])("isPrepId(%s) → %s", (doc, expected) => {
    expect(isPrepId(doc)).toBe(expected);
  });

  it("names a test", () => {
    expect(prepName("kr2")).toBe("КР-2");
  });

  it("keeps a test until the day after its date", () => {
    const preps = [
      { date: "2026-10-22", id: "kr1", title: "" },
      { date: "2026-12-10", id: "kr2", title: "" },
    ];
    expect(upcomingPreps(preps, "2026-10-22").map((prep) => prep.id)).toStrictEqual(["kr1", "kr2"]);
    // the second half of the stream writes the next day
    expect(upcomingPreps(preps, "2026-10-23").map((prep) => prep.id)).toStrictEqual(["kr1", "kr2"]);
    expect(upcomingPreps(preps, "2026-10-24").map((prep) => prep.id)).toStrictEqual(["kr2"]);
  });
});
