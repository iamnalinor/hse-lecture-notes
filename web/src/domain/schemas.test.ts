import { describe, expect, it } from "vitest";

import { CatalogSchema, DocMetaSchema, GlossarySchema } from "./schemas.ts";

describe("build data schemas", () => {
  it("turns snake_case lecture entries into camelCase", () => {
    const catalog = CatalogSchema.parse({
      lectures: {
        algebra: [
          {
            date: "2026-09-03",
            lecture: 1,
            title: "Т",
            week_id: "01_x",
            file: "n.md",
          },
        ],
      },
    });
    expect(catalog.lectures["algebra"]?.[0]?.weekId).toBe("01_x");
    expect(catalog.preps).toStrictEqual({});
  });

  it("reads test preparation pages of a course", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: { calculus: [{ date: "2026-10-22", id: "kr1", title: "Подготовка к КР-1" }] },
    });
    expect(catalog.preps["calculus"]?.[0]?.id).toBe("kr1");
  });

  it("rejects a lecture without a number", () => {
    expect(
      CatalogSchema.safeParse({
        lectures: { a: [{ date: "", title: "", week_id: "" }] },
      }).success,
    ).toBe(false);
  });

  it("reads document meta and ignores the rest", () => {
    const meta = DocMetaSchema.parse({
      date_ru: "23 сентября 2026",
      figures: {},
      kind: "notes",
      lecture: 4,
      title: "Т",
      toc: [{ id: "a", level: 1, text: "Контекст" }],
    });
    expect(meta.dateRu).toBe("23 сентября 2026");
  });

  it("reads glossary entries", () => {
    const [entry] = GlossarySchema.parse([
      { def_html: "d", lecture: 2, term: "t", term_html: "T", week_id: "02" },
    ]);
    expect(entry).toEqual({ defHtml: "d", lecture: 2, term: "t", termHtml: "T", weekId: "02" });
  });
});
