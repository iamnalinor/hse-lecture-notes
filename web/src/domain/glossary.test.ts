import { describe, expect, it } from "vitest";

import type { GlossaryEntry, LectureEntry } from "./schemas.ts";

import { groupGlossary, isGlossaryMatch } from "./glossary.ts";

const entry = (term: string, lecture = 1, defHtml = ""): GlossaryEntry => ({
  defHtml,
  lecture,
  term,
  termHtml: term,
  weekId: `0${String(lecture)}`,
});

const LECTURES: LectureEntry[] = [
  { date: "2026-09-03", lecture: 1, title: "Матрицы", weekId: "01_sep03_matrices" },
  { date: "2026-09-09", lecture: 2, title: "Метод Гаусса", weekId: "02_sep09_gauss" },
];

describe("groupGlossary", () => {
  it("groups by lecture first, then alphabetically with symbols first", () => {
    const groups = groupGlossary(
      [
        entry("Ступенчатый вид", 2),
        entry("Матрица"),
        entry(String.raw`\det A`),
        entry("Алгоритм", 2),
        entry("Единичная матрица"),
      ],
      LECTURES,
    );
    expect(groups.map((group) => [group.lecture, group.title, group.weekId])).toEqual([
      [1, "Матрицы", "01_sep03_matrices"],
      [2, "Метод Гаусса", "02_sep09_gauss"],
    ]);
    expect(groups[0]?.entries.map((item) => item.term)).toEqual([
      String.raw`\det A`,
      "Единичная матрица",
      "Матрица",
    ]);
    expect(groups[1]?.entries.map((item) => item.term)).toEqual(["Алгоритм", "Ступенчатый вид"]);
  });

  it("keeps entries of a lecture the catalog does not know", () => {
    const [group] = groupGlossary([entry("Ранг", 9)], LECTURES);
    expect(group).toMatchObject({ lecture: 9, title: "", weekId: "09" });
  });
});

describe("isGlossaryMatch", () => {
  it("matches the term or the text of the definition, ignoring markup", () => {
    const item = entry("Ранг", 1, '<span class="math">rk</span> — число строк');
    expect(isGlossaryMatch(item, "ранг")).toBe(true);
    expect(isGlossaryMatch(item, "число строк")).toBe(true);
    expect(isGlossaryMatch(item, "math")).toBe(false);
    expect(isGlossaryMatch(item, "  ")).toBe(true);
  });
});
