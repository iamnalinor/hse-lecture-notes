import type { PrepEntry } from "./schemas.ts";

import { shortDate } from "./dates.ts";

/**
Preparation pages live next to lectures: `/<course>/kr1` for a test (`prep/<course>/krN.md`),
`/<course>/colloq1` for a colloquium, the oral part of the exam (`prep/<course>/colloqN.md`),
`/<course>/quiz-o-symbols` for a short quiz (`prep/<course>/quiz-<slug>.md`): quizzes have no known
numbering, so their id names the topic. The build accepts the same ids (`PREP_IDS` in `scripts/build.py`).
*/
export const PREP_IDS = ["kr1", "kr2", "kr3", "colloq1", "colloq2", "quiz-o-symbols"] as const;

type DatedPrep = Extract<PrepEntry, { readonly date: string }>;

/** A prep with a day; one without (`undatedPreps`) never names a day anywhere on the site. */
export const isDated = (prep: PrepEntry): prep is DatedPrep => "date" in prep;

const PREP_ID = /^(?:(?<kind>kr|colloq)(?<number>\d+)|quiz-[a-z0-9][a-z0-9-]*)$/u;

type PrepKind = "colloq" | "kr" | "quiz";

const parse = (id: string): undefined | { readonly kind: PrepKind; readonly number: string } => {
  const match = PREP_ID.exec(id);
  if (match === null) {
    return undefined;
  }
  const number = match.groups?.["number"];
  if (number === undefined) {
    return { kind: "quiz", number: "" };
  }
  return { kind: match.groups?.["kind"] === "colloq" ? "colloq" : "kr", number };
};

export const isPrepId = (doc: string): boolean => PREP_ID.test(doc);

/**
`kr1` → `КР-1`, `colloq1` → `Коллоквиум 1`, a quiz → `Квиз: О-символика` by its `topic` (front matter
`quiz_topic`; quizzes are not numbered).
*/
export const prepName = (id: string, topic?: string): string => {
  const prep = parse(id);
  switch (prep?.kind) {
    case undefined: {
      return id;
    }
    case "colloq": {
      return `Коллоквиум ${prep.number}`;
    }
    case "quiz": {
      return topic === undefined || topic === "" ? "Квиз" : `Квиз: ${topic}`;
    }
    case "kr": {
      return `КР-${prep.number}`;
    }
  }
};

/** Button, crumb and search label: `Подготовка к КР-1`, `Подготовка к коллоквиуму 1`, `Подготовка к квизу`. */
export const prepGoal = (id: string, topic?: string): string => {
  const prep = parse(id);
  switch (prep?.kind) {
    case "colloq": {
      return `Подготовка к коллоквиуму ${prep.number}`;
    }
    case "quiz": {
      return topic === undefined || topic === ""
        ? "Подготовка к квизу"
        : `Подготовка к квизу «${topic}»`;
    }
    case "kr":
    case undefined: {
      return `Подготовка к ${prepName(id)}`;
    }
  }
};

/** What the page holds: a test is about problems, a colloquium about theory and proofs, a quiz about a few problem types. */
export const prepContents = (id: string): string => {
  switch (parse(id)?.kind) {
    case "colloq": {
      return "Определения, теоремы, ход доказательств, вопросы с ответами";
    }
    case "quiz": {
      return "Типы задач, как решать, разобранные примеры";
    }
    case "kr":
    case undefined: {
      return "Темы, методы, задачи с ответами";
    }
  }
};

/** Meta description of the page shell (`spa-fallback.ts`), after the course name. */
export const prepDescription = (id: string): string => {
  switch (parse(id)?.kind) {
    case "colloq": {
      return "определения, теоремы и доказательства к коллоквиуму";
    }
    case "quiz": {
      return "типы задач и разобранные примеры к квизу";
    }
    case "kr":
    case undefined: {
      return "темы, методы и задачи к контрольной";
    }
  }
};

/**
A test is upcoming through its `activeUntil` day inclusive (front matter `active_until`; the test day
unless set — a stream that writes on two consecutive days sets the second one), then it hides itself:
no tile on the home page, no button on the course page.
*/
export const isUpcoming = (prep: PrepEntry, today: string): boolean =>
  isDated(prep) && prep.activeUntil >= today;

/**
A prep is drawn in the accent colour (home tile, course page button) only near the event: from
`highlightFrom` (front matter `highlight_from`, two weeks before `date` unless set) through `activeUntil`.
Before that it is shown, but neutral — a colloquium whose window opens in November and ends with the
December session should not shout from the page for two months.
*/
export const isHighlighted = (prep: PrepEntry, today: string): boolean =>
  isDated(prep) && prep.highlightFrom <= today && isUpcoming(prep, today);

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
When a prep is shown: a test — its day (`02.11`), even if a stream writes it on two days; a colloquium
with a window — the whole window (`02.11–30.12`), so that in December the tile does not read like a past
day; a quiz announced for a week without the day — that week (`23.11–27.11`).
*/
export const prepWhen = (prep: DatedPrep): string => {
  const kind = parse(prep.id)?.kind;
  return (kind === "colloq" || kind === "quiz") && prep.activeUntil !== prep.date
    ? `${shortDate(prep.date)}–${shortDate(prep.activeUntil)}`
    : shortDate(prep.date);
};

/** The next day that matters: the first day while it is ahead, then the last active day. */
const nextDay = (prep: DatedPrep, today: string): string =>
  prep.date >= today ? prep.date : prep.activeUntil;

/**
Upcoming preps, the nearest first: a test that falls inside a colloquium's long window comes
before the colloquium once the window has opened (the home tile shows the first one).
*/
export const upcomingPreps = (preps: readonly PrepEntry[], today: string): readonly DatedPrep[] =>
  preps
    .filter(isDated)
    .filter((prep) => isUpcoming(prep, today))
    .toSorted((a, b) => nextDay(a, today).localeCompare(nextDay(b, today)));

/** Preps whose last active day has passed, in the order they happened: kept on the course page for revision. */
export const pastPreps = (preps: readonly PrepEntry[], today: string): readonly DatedPrep[] =>
  preps
    .filter(isDated)
    .filter((prep) => !isUpcoming(prep, today))
    .toSorted((a, b) => a.date.localeCompare(b.date));

/**
All preps of a course in the order of their events, whatever their state: by day, and those without
a day yet (their event is still ahead) after the dated ones, by id. The course page shows them so,
each styled by its state.
*/
export const chronologicalPreps = (preps: readonly PrepEntry[]): readonly PrepEntry[] => {
  // undated ones after every date, then by id; code-unit order, not locale (which puts «~» first)
  const key = (prep: PrepEntry): readonly [number, string] =>
    isDated(prep) ? [0, prep.date] : [1, prep.id];
  return preps.toSorted((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (ka[0] !== kb[0]) {
      return ka[0] - kb[0];
    }
    return ka[1] < kb[1] ? -1 : Number(ka[1] > kb[1]);
  });
};

/**
Preps of events not announced yet (no `date`): shown on the course page, neutral and without a day,
so one can start early; never on the home page and never in the accent colour.
*/
export const undatedPreps = (preps: readonly PrepEntry[]): readonly PrepEntry[] =>
  preps.filter((prep) => !isDated(prep));
