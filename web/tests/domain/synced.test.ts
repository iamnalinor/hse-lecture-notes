import { describe, expect, it } from "vitest";

import { syncedHint, syncedLabel } from "#web/domain/synced.ts";

describe("syncedLabel", () => {
  it("names what the note was checked against", () => {
    expect(syncedLabel(["lecture"])).toBe("Сверено с лекцией");
    expect(syncedLabel(["lecture", "seminars"])).toBe("Сверено с лекцией и семинарами");
  });

  it("does not depend on the order", () => {
    expect(syncedLabel(["seminars", "lecture"])).toBe("Сверено с лекцией и семинарами");
  });

  it("is empty for a note that is not synced", () => {
    expect(syncedLabel([])).toBeNull();
    expect(syncedLabel(["seminars"])).toBeNull();
  });
});

describe("syncedHint", () => {
  it("says in one sentence what the note matches", () => {
    expect(syncedHint(["lecture"])).toBe("Содержание совпадает с реальной лекцией этого года");
    expect(syncedHint(["lecture", "seminars"])).toBe(
      "Содержание совпадает с реальными лекцией и семинаром этого года",
    );
    expect(syncedHint([])).toBeNull();
  });
});
