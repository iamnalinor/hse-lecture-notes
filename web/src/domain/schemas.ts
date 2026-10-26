import { z } from "zod";

/** The build (`scripts/build.py`) writes snake_case JSON; the schemas expose camelCase. */

const LectureEntrySchema = z
  .object({
    date: z.string(),
    lecture: z.number(),
    title: z.string(),
    week_id: z.string(),
  })
  .transform(({ week_id: weekId, ...rest }) => ({ ...rest, weekId }));
export type LectureEntry = z.infer<typeof LectureEntrySchema>;

/**
A page that prepares for a test or a colloquium (`prep/<course>/krN.md`, `colloqN.md`): `id` is `kr1`,
`colloq1`…, `date` is the test day (for a colloquium — the first day of its window),
`activeUntil` — the last day the test is shown as upcoming (front matter `active_until`, the test day
by default), `cheatsheets` — print variants of its cheatsheet PDF (`1side`, `2side`), empty when there is none,
`bank` — the page has a ticket bank (`bank.json`, see `TicketBankSchema`) and shows the ticket generator.
*/
const PrepEntrySchema = z
  .object({
    active_until: z.string().optional(),
    bank: z.boolean().optional(),
    cheatsheets: z.array(z.string()).default([]),
    date: z.string(),
    id: z.string(),
    title: z.string(),
  })
  .transform(({ active_until: activeUntil, ...rest }) => ({
    ...rest,
    activeUntil: activeUntil ?? rest.date,
  }));
export type PrepEntry = z.infer<typeof PrepEntrySchema>;

export const CatalogSchema = z.object({
  lectures: z.record(z.string(), z.array(LectureEntrySchema)),
  preps: z.record(z.string(), z.array(PrepEntrySchema)).default({}),
});

const LabelTypeSchema = z.enum([
  "axiom",
  "corollary",
  "definition",
  "equation",
  "example",
  "figure",
  "lemma",
  "problem",
  "proposition",
  "remark",
  "section",
  "theorem",
]);

const LabelSchema = z
  .object({
    id: z.string(),
    lecture: z.number(),
    name: z.string(),
    number: z.string(),
    tag: z.string().optional(),
    title: z.string(),
    type: LabelTypeSchema,
    week_id: z.string(),
  })
  .transform(({ week_id: weekId, ...rest }) => ({ ...rest, weekId }));
export type Label = z.infer<typeof LabelSchema>;

/** course → label id → label */
export const LabelIndexSchema = z.record(z.string(), z.record(z.string(), LabelSchema));
export type LabelIndex = z.infer<typeof LabelIndexSchema>;

const TocItemSchema = z.object({ id: z.string(), level: z.number(), text: z.string() });
export type TocItem = z.infer<typeof TocItemSchema>;

export const DocMetaSchema = z
  .object({
    date: z.string().optional(),
    date_ru: z.string(),
    kind: z.enum(["notes", "prep", "theory"]),
    lecture: z.number(),
    title: z.string(),
    toc: z.array(TocItemSchema),
  })
  .transform(({ date_ru: dateRu, ...rest }) => ({ ...rest, dateRu }));
export type DocMeta = z.infer<typeof DocMetaSchema>;

const GlossaryEntrySchema = z
  .object({
    def_html: z.string(),
    lecture: z.number(),
    term: z.string(),
    term_html: z.string(),
    week_id: z.string(),
  })
  .transform(({ def_html: defHtml, term_html: termHtml, week_id: weekId, ...rest }) => ({
    ...rest,
    defHtml,
    termHtml,
    weekId,
  }));
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export const GlossarySchema = z.array(GlossaryEntrySchema);

/** `search.json`: the plain text of every document, one entry per section or block. */
const SearchEntrySchema = z.object({
  anchor: z.string(),
  course: z.string(),
  doc: z.string(),
  heading: z.string(),
  lecture: z.number(),
  text: z.string(),
});
export type SearchEntry = z.infer<typeof SearchEntrySchema>;
export const SearchIndexSchema = z.array(SearchEntrySchema);

/**
`<course>/<prep>/bank.json` (from `prep/<course>/<prep>-bank.yaml`): the ticket format, topic titles
(sections `sec:<prep>:<topic>` of the page) and the questions. `text` and `answer` are HTML fragments
(formulas as `span.math`, references as `a.ref`); `refs` are the blocks that answer the question and
the document each lives in (a lecture `week_id` or the prep page itself).
*/
const TicketRefSchema = z.object({ doc: z.string(), id: z.string() });

const TicketQuestionSchema = z.object({
  answer: z.string(),
  id: z.string(),
  kind: z.string(),
  refs: z.array(TicketRefSchema),
  text: z.string(),
  topic: z.string(),
});

const TicketPartSchema = z.object({
  count: z.number(),
  kind: z.string(),
  points: z.string(),
  /** Answers of this kind show the proofs that follow the referenced statements. */
  proofs: z.boolean().default(false),
  title: z.string(),
});

export const TicketBankSchema = z.object({
  questions: z.array(TicketQuestionSchema),
  ticket: z.array(TicketPartSchema),
  topics: z.record(z.string(), z.string()),
});
export type TicketBank = z.infer<typeof TicketBankSchema>;
export type TicketQuestion = z.infer<typeof TicketQuestionSchema>;
export type TicketRef = z.infer<typeof TicketRefSchema>;

export const MacrosSchema = z.record(z.string(), z.string());

/** `offline-manifest.json`, written by `scripts/build-sw.ts` (see `offline.ts`). */
const OfflineDocSchema = z.object({
  files: z.array(z.string()),
  id: z.string(),
  kind: z.enum(["glossary", "notes", "prep", "theory"]),
});

export const OfflineManifestSchema = z.object({
  docs: z.array(OfflineDocSchema),
  files: z.record(z.string(), z.string()),
  precache: z.array(z.string()),
  version: z.string(),
});
