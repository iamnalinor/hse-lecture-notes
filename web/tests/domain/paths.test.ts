import { describe, expect, it } from "vitest";

import { isDocumentPath, isOtherPage } from "#web/domain/paths.ts";

describe("isDocumentPath", () => {
  it.each([
    ["/", false],
    ["/algebra", false],
    ["/algebra/theory", true],
    ["/algebra/program", true],
    ["/algebra/kr1", true],
    ["/calculus/colloq1", true],
    ["/algebra/04_sep23_determinant_properties", true],
  ])("%s → %s", (pathname, expected) => {
    expect(isDocumentPath(pathname)).toBe(expected);
  });
});

describe("isOtherPage", () => {
  it.each([
    ["/algebra", "/algebra", false],
    ["/algebra", "/algebra/", false],
    ["/", "", false],
    ["/algebra", "/algebra/theory", true],
    ["/algebra/theory", "/", true],
  ])("%s → %s: %s", (from, to, isOther) => {
    expect(isOtherPage(from, to)).toBe(isOther);
  });
});
