import { describe, expect, it } from "vitest";

import { cheatsheetDocs, isPrepId, isUpcoming, prepName, upcomingPreps } from "./preps.ts";

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

  it("keeps a test through its last active day", () => {
    const preps = [
      // the second half of the stream writes the next day
      { activeUntil: "2026-10-23", cheatsheets: [], date: "2026-10-22", id: "kr1", title: "" },
      { activeUntil: "2026-12-10", cheatsheets: [], date: "2026-12-10", id: "kr2", title: "" },
    ];
    expect(upcomingPreps(preps, "2026-10-22").map((prep) => prep.id)).toStrictEqual(["kr1", "kr2"]);
    expect(upcomingPreps(preps, "2026-10-23").map((prep) => prep.id)).toStrictEqual(["kr1", "kr2"]);
    expect(upcomingPreps(preps, "2026-10-24").map((prep) => prep.id)).toStrictEqual(["kr2"]);
  });

  it("hides a one-day test the day after it", () => {
    const prep = {
      activeUntil: "2026-10-24",
      cheatsheets: [],
      date: "2026-10-24",
      id: "kr1",
      title: "",
    };
    expect(isUpcoming(prep, "2026-10-24")).toBe(true);
    expect(isUpcoming(prep, "2026-10-25")).toBe(false);
  });

  it("names the cheatsheet PDFs after the prep page and the print variant", () => {
    const prep = {
      activeUntil: "2026-10-24",
      cheatsheets: ["1side", "2side"],
      date: "2026-10-24",
      id: "kr1",
      title: "",
    };
    expect(cheatsheetDocs(prep)).toStrictEqual([
      { docId: "kr1-cheatsheet-1side", label: "Шпаргалка, 1 сторона" },
      { docId: "kr1-cheatsheet-2side", label: "Шпаргалка, 2 стороны" },
    ]);
  });

  it("has no cheatsheet links when the build found none", () => {
    expect(
      cheatsheetDocs({
        activeUntil: "2026-10-24",
        cheatsheets: [],
        date: "2026-10-24",
        id: "kr1",
        title: "",
      }),
    ).toStrictEqual([]);
  });
});
