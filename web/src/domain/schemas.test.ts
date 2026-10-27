import { describe, expect, it } from "vitest";

import { CatalogSchema, DocMetaSchema, GlossarySchema, TicketBankSchema } from "./schemas.ts";

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
    // data of an older build has no program pages
    expect(catalog.programs).toStrictEqual([]);
  });

  it("knows which courses have the program page", () => {
    const catalog = CatalogSchema.parse({ lectures: {}, programs: ["algebra", "discrete"] });
    expect(catalog.programs).toStrictEqual(["algebra", "discrete"]);
    expect(
      DocMetaSchema.parse({ date_ru: "", kind: "program", lecture: 0, title: "П", toc: [] }).kind,
    ).toBe("program");
  });

  it("reads test preparation pages of a course", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: { calculus: [{ date: "2026-10-22", id: "kr1", title: "Подготовка к КР-1" }] },
    });
    expect(catalog.preps["calculus"]?.[0]?.id).toBe("kr1");
    expect(catalog.preps["calculus"]?.[0]?.cheatsheets).toStrictEqual([]);
    // without `active_until` the test stays active through its own day
    expect(catalog.preps["calculus"]?.[0]?.activeUntil).toBe("2026-10-22");
    // without `highlight_from` the accent starts two weeks before the test
    expect(catalog.preps["calculus"]?.[0]?.highlightFrom).toBe("2026-10-08");
  });

  it("reads the first accented day of a prep", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: {
        calculus: [
          {
            active_until: "2026-12-30",
            date: "2026-11-02",
            highlight_from: "2026-12-07",
            id: "colloq1",
            title: "",
          },
        ],
      },
    });
    expect(catalog.preps["calculus"]?.[0]?.highlightFrom).toBe("2026-12-07");
  });

  it("knows which preparation page has a ticket bank", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: {
        calculus: [
          { date: "2026-10-22", id: "kr1", title: "" },
          { bank: true, date: "2026-11-02", id: "colloq1", title: "" },
        ],
      },
    });
    expect(catalog.preps["calculus"]?.map((prep) => prep.bank)).toStrictEqual([undefined, true]);
  });

  it("reads a ticket bank and rejects one without answers", () => {
    const bank = {
      questions: [
        {
          answer: "",
          id: "bw",
          kind: "proof",
          refs: [{ doc: "06_oct09_subsequences_cauchy", id: "thm:lec06:bw" }],
          text: "<p>Теорема Больцано–Вейерштрасса.</p>",
          topic: "bw",
        },
      ],
      ticket: [{ count: 2, kind: "proof", points: "2 балла", title: "Теорема" }],
      topics: { bw: "Подпоследовательности" },
    };
    expect(TicketBankSchema.parse(bank).questions[0]?.refs[0]?.id).toBe("thm:lec06:bw");
    const broken = { ...bank, questions: [{ ...bank.questions[0], refs: undefined }] };
    expect(TicketBankSchema.safeParse(broken).success).toBe(false);
  });

  it("reads a ticket item with variants (`one_of`) as `oneOf`", () => {
    const part = { count: 1, kind: "problem", points: "2 балла", proofs: false, title: "Задача" };
    const bank = TicketBankSchema.parse({
      questions: [],
      ticket: [{ one_of: [[part], [{ ...part, kind: "claim" }]] }],
      topics: {},
    });
    expect(bank.ticket[0]).toStrictEqual({ oneOf: [[part], [{ ...part, kind: "claim" }]] });
  });

  it("reads the last active day of a test", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: {
        calculus: [{ active_until: "2026-10-23", date: "2026-10-22", id: "kr1", title: "" }],
      },
    });
    expect(catalog.preps["calculus"]?.[0]?.activeUntil).toBe("2026-10-23");
  });

  it("reads the print variants of a test cheatsheet", () => {
    const catalog = CatalogSchema.parse({
      lectures: {},
      preps: {
        discrete: [{ cheatsheets: ["1side", "2side"], date: "2026-10-24", id: "kr1", title: "" }],
      },
    });
    expect(catalog.preps["discrete"]?.[0]?.cheatsheets).toStrictEqual(["1side", "2side"]);
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
