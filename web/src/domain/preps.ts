import type { PrepEntry } from "./schemas.ts";

import { shortDate } from "./dates.ts";

/**
Preparation pages live next to lectures: `/<course>/kr1` for a test (`prep/<course>/krN.md`),
`/<course>/colloq1` for a colloquium, the oral part of the exam (`prep/<course>/colloqN.md`).
The build accepts the same ids (`PREP_IDS` in `scripts/build.py`).
*/
export const PREP_IDS = ["kr1", "kr2", "kr3", "colloq1", "colloq2"] as const;

const PREP_ID = /^(?<kind>kr|colloq)(?<number>\d+)$/u;

const parse = (id: string) => {
  const groups = PREP_ID.exec(id)?.groups;
  const number = groups?.["number"];
  return number === undefined ? undefined : { colloq: groups?.["kind"] === "colloq", number };
};

export const isPrepId = (doc: string): boolean => PREP_ID.test(doc);

/** `kr1` → `КР-1`, `colloq1` → `Коллоквиум 1` */
export const prepName = (id: string): string => {
  const prep = parse(id);
  if (prep === undefined) {
    return id;
  }
  return prep.colloq ? `Коллоквиум ${prep.number}` : `КР-${prep.number}`;
};

/** Button, crumb and search label: `Подготовка к КР-1`, `Подготовка к коллоквиуму 1`. */
export const prepGoal = (id: string): string => {
  const prep = parse(id);
  return prep?.colloq === true
    ? `Подготовка к коллоквиуму ${prep.number}`
    : `Подготовка к ${prepName(id)}`;
};

/** What the page holds: a test is about problems, a colloquium about theory and proofs. */
export const prepContents = (id: string): string =>
  parse(id)?.colloq === true
    ? "Определения, теоремы, ход доказательств, вопросы с ответами"
    : "Темы, методы, задачи с ответами";

/** Meta description of the page shell (`spa-fallback.ts`), after the course name. */
export const prepDescription = (id: string): string =>
  parse(id)?.colloq === true
    ? "определения, теоремы и доказательства к коллоквиуму"
    : "темы, методы и задачи к контрольной";

/**
A test is upcoming through its `activeUntil` day inclusive (front matter `active_until`; the test day
unless set — a stream that writes on two consecutive days sets the second one), then it hides itself:
no tile on the home page, a plain button on the course page.
*/
export const isUpcoming = (prep: PrepEntry, today: string): boolean => prep.activeUntil >= today;

const CHEATSHEET_LABELS: Readonly<Record<string, string>> = {
  "1side": "Шпаргалка, 1 сторона",
  "2side": "Шпаргалка, 2 стороны",
};

/** A downloadable PDF next to a document: `docId` names the file (`pdf/<course>-<docId>.pdf`). */
export type PdfDoc = { readonly docId: string; readonly label: string };

/** Cheatsheet PDFs of a test (`prep/<course>/cheatsheet/krN-cheatsheet-<variant>.tex`), one per print variant. */
export const cheatsheetDocs = (prep: PrepEntry): readonly PdfDoc[] =>
  prep.cheatsheets.map((variant) => ({
    docId: `${prep.id}-cheatsheet-${variant}`,
    label: CHEATSHEET_LABELS[variant] ?? `Шпаргалка (${variant})`,
  }));

/**
When a prep is shown: a test — its day (`02.11`); a colloquium with a window — the whole window
(`02.11–30.12`), so that in December the tile does not read like a past day.
*/
export const prepWhen = (prep: PrepEntry): string =>
  parse(prep.id)?.colloq === true && prep.activeUntil !== prep.date
    ? `${shortDate(prep.date)}–${shortDate(prep.activeUntil)}`
    : shortDate(prep.date);

/** The next day that matters: the first day while it is ahead, then the last active day. */
const nextDay = (prep: PrepEntry, today: string): string =>
  prep.date >= today ? prep.date : prep.activeUntil;

/**
Upcoming preps, the nearest first: a test that falls inside a colloquium's long window comes
before the colloquium once the window has opened (the home tile shows the first one).
*/
export const upcomingPreps = (preps: readonly PrepEntry[], today: string): readonly PrepEntry[] =>
  preps
    .filter((prep) => isUpcoming(prep, today))
    .toSorted((a, b) => nextDay(a, today).localeCompare(nextDay(b, today)));
