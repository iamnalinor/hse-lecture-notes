import { describe, expect, it } from "vitest";

import { syncedHint, syncedLabel } from "./synced.ts";

describe("syncedLabel", () => {
  it("names what the note was checked against", () => {
    expect(syncedLabel(["lecture"])).toBe("Сверено с лекцией");
    expect(syncedLabel(["lecture", "seminars"])).toBe("Сверено с лекцией и семинарами");
    expect(syncedLabel(["seminars"])).toBe("Сверено с семинарами");
  });

  it("does not depend on the order", () => {
    expect(syncedLabel(["seminars", "lecture"])).toBe("Сверено с лекцией и семинарами");
  });

  it("is empty for a note that is not synced", () => {
    expect(syncedLabel([])).toBeNull();
  });
});

describe("syncedHint", () => {
  it("adds a short explanation to the label", () => {
    expect(syncedHint(["lecture"])).toBe(
      "Сверено с лекцией: содержание и темп совпадают с реальной лекцией этого года",
    );
    expect(syncedHint(["seminars"])).toBe(
      "Сверено с семинарами: в конспект включён материал семинаров этого года",
    );
    expect(syncedHint(["lecture", "seminars"])).toBe(
      "Сверено с лекцией и семинарами: содержание и темп совпадают с реальной лекцией этого года, в конспект включён материал семинаров этого года",
    );
  });
});
