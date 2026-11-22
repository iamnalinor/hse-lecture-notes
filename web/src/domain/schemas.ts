import { z } from "zod";

import { addDays } from "./dates.ts";

/** The build (`scripts/build.py`) writes snake_case JSON; the schemas expose camelCase. */

const LectureEntrySchema = z
  .object({
    date: z.string(),
    lecture: z.number(),
    /** Front matter `synced: true`: the note was checked against this year's real lecture. */
    synced: z.boolean().default(false),
    title: z.string(),
    week_id: z.string(),
  })
  .transform(({ week_id: weekId, ...rest }) => ({ ...rest, weekId }));
export type LectureEntry = z.infer<typeof LectureEntrySchema>;

/**
A page that prepares for a test, a colloquium or a quiz (`prep/<course>/krN.md`, `colloqN.md`,
`quiz-<slug>.md`): `id` is `kr1`, `colloq1`, `quiz-o-symbols`…, `topic` — the topic of a quiz (front
matter `quiz_topic`, only quizzes have it), `date` is the test day (for a colloquium — the first day of its window),
`activeUntil` — the last day the test is shown as upcoming (front matter `active_until`, the test day
by default), `highlightFrom` — the first day the prep is drawn in the accent colour, through `activeUntil`
(front matter `highlight_from`, two weeks before `date` by default), `cheatsheets` — print variants of its cheatsheet PDF (`1side`, `2side`), empty when there is none,
A prep without `date` (an event not announced yet) has none of the three days: see `undatedPreps`.
`bank` — the page has a ticket bank (`bank.json`, see `TicketBankSchema`) and shows the ticket generator.
*/
/** Default accent lead before the event day; the build uses the same (`HIGHLIGHT_DAYS` in `scripts/build.py`). */
const HIGHLIGHT_DAYS = 14;

const PrepEntrySchema = z
  .object({
    active_until: z.string().nullish(),
    bank: z.boolean().optional(),
    cheatsheets: z.array(z.string()).default([]),
    date: z.string().nullish(),
    highlight_from: z.string().nullish(),
    id: z.string(),
    quiz_topic: z.string().nullish(),
    title: z.string(),
  })
  .transform(
    ({
      active_until: activeUntil,
      date,
      highlight_from: highlightFrom,
      quiz_topic: quizTopic,
      ...rest
    }) => {
      // only a quiz has a topic (`prepName`): «Квиз: О-символика»
      const named = {
        ...rest,
        ...(!(quizTopic === null || quizTopic === undefined) && { topic: quizTopic }),
      };
      // No `date`: the event is not announced yet, the page is there to study from in advance.
      return date === null || date === undefined
        ? named
        : {
            ...named,
            activeUntil: activeUntil ?? date,
            date,
            highlightFrom: highlightFrom ?? addDays(date, -HIGHLIGHT_DAYS),
          };
    },
  );
export type PrepEntry = z.infer<typeof PrepEntrySchema>;

export const CatalogSchema = z.object({
  lectures: z.record(z.string(), z.array(LectureEntrySchema)),
  preps: z.record(z.string(), z.array(PrepEntrySchema)).default({}),
  /** Courses that have the «План учебной дисциплины» page (`program/<course>.md`). */
  programs: z.array(z.string()).default([]),
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
    kind: z.enum(["notes", "prep", "program", "theory"]),
    lecture: z.number(),
    title: z.string(),
    toc: z.array(TocItemSchema),
  })
  .transform(({ date_ru: dateRu, ...rest }) => ({ ...rest, dateRu }));
export type DocMeta = z.infer<typeof DocMetaSchema>;

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

/** A ticket item with variants (`one_of` in the bank): the generator takes one of them at random. */
const TicketChoiceSchema = z
  .object({ one_of: z.array(z.array(TicketPartSchema)).min(2) })
  .transform(({ one_of: oneOf }) => ({ oneOf }));

export const TicketBankSchema = z.object({
  /** Caption of the generator: what a generated set of questions holds. */
  about: z.string().default(""),
  questions: z.array(TicketQuestionSchema),
  ticket: z.array(z.union([TicketPartSchema, TicketChoiceSchema])),
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
  kind: z.enum(["notes", "prep", "program", "theory"]),
});

export const OfflineManifestSchema = z.object({
  docs: z.array(OfflineDocSchema),
  files: z.record(z.string(), z.string()),
  precache: z.array(z.string()),
  sizes: z.record(z.string(), z.number()).optional(),
  version: z.string(),
});
