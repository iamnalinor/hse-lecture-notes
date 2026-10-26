import { describe, expect, it } from "vitest";

import { isDocumentPath } from "./paths.ts";

describe("isDocumentPath", () => {
  it.each([
    ["/", false],
    ["/algebra", false],
    ["/algebra/glossary", false],
    ["/algebra/theory", true],
    ["/algebra/kr1", true],
    ["/calculus/colloq1", true],
    ["/algebra/04_sep23_determinant_properties", true],
  ])("%s → %s", (pathname, expected) => {
    expect(isDocumentPath(pathname)).toBe(expected);
  });
});
