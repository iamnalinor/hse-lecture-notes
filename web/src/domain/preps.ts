import type { PrepEntry } from "./schemas.ts";

/** Test preparation pages (`prep/<course>/krN.md`) live next to lectures: `/<course>/kr1`. */
export const PREP_IDS = ["kr1", "kr2", "kr3"] as const;

const PREP_ID = /^kr(?<number>\d+)$/u;

export const isPrepId = (doc: string): boolean => PREP_ID.test(doc);

/** `kr1` → `КР-1` */
export const prepName = (id: string): string => {
  const number = PREP_ID.exec(id)?.groups?.["number"];
  return number === undefined ? id : `КР-${number}`;
};

const DAY_MS = 86_400_000;

/**
A test is upcoming until the day after its date inclusive: `date` is the first day, and a stream
often writes it on two consecutive days (calculus: Thursday evening and Friday morning).
*/
export const isUpcoming = (prep: PrepEntry, today: string): boolean => {
  const dayAfter = new Date(Date.parse(prep.date) + DAY_MS).toISOString().slice(0, 10);
  return dayAfter >= today;
};

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

export const upcomingPreps = (preps: readonly PrepEntry[], today: string): readonly PrepEntry[] =>
  preps.filter((prep) => isUpcoming(prep, today));
