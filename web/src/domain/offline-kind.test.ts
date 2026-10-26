import { describe, expect, it } from "vitest";

import { offlineDocKind } from "./offline-kind.ts";

describe("offlineDocKind", () => {
  it.each([
    ["glossary", "glossary"],
    ["kr1", "prep"],
    ["colloq1", "prep"],
    ["theory", "theory"],
    ["program", "program"],
    ["04_sep23_determinant_properties", "notes"],
  ])("%s → %s", (doc, kind) => {
    expect(offlineDocKind(doc)).toBe(kind);
  });
});
