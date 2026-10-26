import { describe, expect, it } from "vitest";

import {
  cheatsheetDocs,
  isPrepId,
  isUpcoming,
  PREP_IDS,
  prepContents,
  prepDescription,
  prepGoal,
  prepName,
  prepWhen,
  upcomingPreps,
} from "./preps.ts";

describe("test preparation pages", () => {
  it.each([
    ["kr1", true],
    ["kr12", true],
    ["colloq1", true],
    ["colloq", false],
    ["theory", false],
    ["01_sep04_logic", false],
  ])("isPrepId(%s) → %s", (doc, expected) => {
    expect(isPrepId(doc)).toBe(expected);
  });

  it("names a test", () => {
    expect(prepName("kr2")).toBe("КР-2");
    expect(prepGoal("kr2")).toBe("Подготовка к КР-2");
    expect(prepContents("kr2")).toBe("Темы, методы, задачи с ответами");
    expect(prepDescription("kr2")).toBe("темы, методы и задачи к контрольной");
  });

  it("names a colloquium without «КР»", () => {
    expect(prepName("colloq1")).toBe("Коллоквиум 1");
    expect(prepGoal("colloq1")).toBe("Подготовка к коллоквиуму 1");
    expect(prepContents("colloq1")).not.toContain("задачи с ответами");
    expect(prepDescription("colloq1")).toContain("коллоквиум");
  });

  it("routes every prep id the build accepts", () => {
    expect(PREP_IDS).toContain("colloq1");
    expect(PREP_IDS.every((id) => isPrepId(id))).toBe(true);
  });

  it("shows a test inside a colloquium's window first once the window has opened", () => {
    const colloq = {
      activeUntil: "2026-12-30",
      cheatsheets: [],
      date: "2026-11-02",
      id: "colloq1",
      title: "",
    };
    const kr2 = {
      activeUntil: "2026-12-10",
      cheatsheets: [],
      date: "2026-12-10",
      id: "kr2",
      title: "",
    };
    const preps = [colloq, kr2];
    // before the window: the colloquium comes first
    expect(upcomingPreps(preps, "2026-10-30").map((prep) => prep.id)).toStrictEqual([
      "colloq1",
      "kr2",
    ]);
    // inside the window: the test, then the rest of the window
    expect(upcomingPreps(preps, "2026-11-20").map((prep) => prep.id)).toStrictEqual([
      "kr2",
      "colloq1",
    ]);
    expect(upcomingPreps(preps, "2026-12-11").map((prep) => prep.id)).toStrictEqual(["colloq1"]);
  });

  it("dates a colloquium by its window and a test by its day", () => {
    expect(
      prepWhen({
        activeUntil: "2026-12-30",
        cheatsheets: [],
        date: "2026-11-02",
        id: "colloq1",
        title: "",
      }),
    ).toBe("02.11–30.12");
    expect(
      prepWhen({
        activeUntil: "2026-10-23",
        cheatsheets: [],
        date: "2026-10-22",
        id: "kr1",
        title: "",
      }),
    ).toBe("22.10");
  });

  it("keeps a colloquium upcoming through its whole window", () => {
    const colloq = {
      activeUntil: "2026-12-30",
      cheatsheets: [],
      date: "2026-11-02",
      id: "colloq1",
      title: "",
    };
    expect(isUpcoming(colloq, "2026-11-20")).toBe(true);
    expect(isUpcoming(colloq, "2026-12-30")).toBe(true);
    expect(isUpcoming(colloq, "2026-12-31")).toBe(false);
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
