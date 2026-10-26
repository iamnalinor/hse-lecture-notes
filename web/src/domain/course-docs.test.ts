import { describe, expect, it } from "vitest";

import {
  COURSE_DOC_DESCRIPTIONS,
  COURSE_DOCS,
  courseDocTitle,
  isCourseDoc,
} from "./course-docs.ts";
import { paths } from "./paths.ts";

describe("course documents", () => {
  it.each([
    ["theory", true],
    ["program", true],
    ["kr1", false],
    ["glossary", false],
    ["04_sep23_determinant_properties", false],
  ])("%s is a course document: %s", (doc, expected) => {
    expect(isCourseDoc(doc)).toBe(expected);
  });

  it("has a route and a name for each document", () => {
    expect(paths.program("discrete", "автомат")).toBe("/discrete/program#автомат");
    expect(COURSE_DOCS.program).toBe("Программа и оценивание");
  });

  it("titles the page and its shell like the smoke test of Pages expects", () => {
    expect(courseDocTitle("Математический анализ", "program")).toBe(
      "Математический анализ: программа и оценивание",
    );
    expect(courseDocTitle("Алгебра", "theory")).toBe("Алгебра: теория");
    expect(COURSE_DOC_DESCRIPTIONS.program).toContain("формула оценки");
  });
});
