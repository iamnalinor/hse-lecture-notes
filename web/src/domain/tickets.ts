import type { TicketBank, TicketQuestion, TicketRef } from "./schemas.ts";

/**
A random ticket from the bank of a preparation page (`prep/<course>/<prep>-bank.yaml`): its parts go
in the order of `ticket`, each with `count` questions of its kind. Questions of one ticket come from
different topics while the bank allows it; otherwise any unused question of the kind is taken.
*/

/** `Math.random`-like: a number in `[0, 1)`. */
type Random = () => number;

export type TicketPart = {
  readonly kind: string;
  readonly points: string;
  /** Answers show the proofs of the referenced statements. */
  readonly proofs: boolean;
  readonly questions: readonly TicketQuestion[];
  readonly title: string;
};

const pick = <T>(items: readonly T[], random: Random): T | undefined =>
  items[Math.floor(random() * items.length)];

const drawOne = (
  questions: readonly TicketQuestion[],
  kind: string,
  taken: readonly TicketQuestion[],
): readonly TicketQuestion[] => {
  const free = questions.filter((question) => question.kind === kind && !taken.includes(question));
  const usedTopics = new Set(taken.map((question) => question.topic));
  const fresh = free.filter((question) => !usedTopics.has(question.topic));
  return fresh.length > 0 ? fresh : free;
};

type Draw = {
  readonly bank: TicketBank;
  readonly random: Random;
  /** Questions already in the ticket: never again, and their topics only as a last resort. */
  readonly taken: readonly TicketQuestion[];
};

const drawKind = (draw: Draw, kind: string, count: number): readonly TicketQuestion[] => {
  if (count <= 0) {
    return [];
  }
  const next = pick(drawOne(draw.bank.questions, kind, draw.taken), draw.random);
  return next === undefined
    ? []
    : [next, ...drawKind({ ...draw, taken: [...draw.taken, next] }, kind, count - 1)];
};

const drawParts = (draw: Draw, entries: TicketBank["ticket"]): readonly TicketPart[] => {
  const [first, ...rest] = entries;
  if (first === undefined) {
    return [];
  }
  if ("oneOf" in first) {
    // a choice of variants (problem: two short items or one problem): one of them, then the rest;
    // under a topic filter only a variant that still has questions, unless none has
    const hasQuestions = (variant: (typeof first.oneOf)[number]): boolean =>
      variant.some((entry) => draw.bank.questions.some((question) => question.kind === entry.kind));
    const live = first.oneOf.filter((variant) => hasQuestions(variant));
    const variants = live.length > 0 ? live : first.oneOf;
    return drawParts(draw, [...(pick(variants, draw.random) ?? []), ...rest]);
  }
  const questions = drawKind(draw, first.kind, first.count);
  const tail = drawParts({ ...draw, taken: [...draw.taken, ...questions] }, rest);
  if (questions.length === 0) {
    // the chosen topics have nothing of this kind: the part is left out, not shown empty
    return tail;
  }
  const { kind, points, proofs, title } = first;
  return [{ kind, points, proofs, questions, title }, ...tail];
};

/**
`topics` narrows the draw to questions of these topics (the topic filter of the generator); parts
with no question left are dropped. Without it — the whole bank.
*/
export const drawTicket = (
  bank: TicketBank,
  random: Random = Math.random,
  topics?: ReadonlySet<string>,
): readonly TicketPart[] => {
  const questions =
    topics === undefined
      ? bank.questions
      : bank.questions.filter((question) => topics.has(question.topic));
  return drawParts({ bank: { ...bank, questions }, random, taken: [] }, bank.ticket);
};

const ticketKinds = (bank: TicketBank): ReadonlySet<string> =>
  new Set(
    bank.ticket
      .flatMap((entry) => ("oneOf" in entry ? entry.oneOf.flat() : entry))
      .map((part) => part.kind),
  );

/**
Topics a ticket can be drawn from: those with a question of a kind the ticket uses. Page order
(`bank.topics` follows the page's sections), then any topic missing from it.
*/
export const bankTopics = (bank: TicketBank): readonly string[] => {
  const kinds = ticketKinds(bank);
  const used = new Set(
    bank.questions.filter((question) => kinds.has(question.kind)).map((question) => question.topic),
  );
  const listed = Object.keys(bank.topics);
  return [
    ...listed.filter((topic) => used.has(topic)),
    ...[...used].filter((topic) => !listed.includes(topic)),
  ];
};

/** A proof outline of the page itself: `rem:<prep>:proof-…` («ход доказательства»). */
const isOwnOutline = (ref: TicketRef, prepId: string): boolean =>
  ref.doc === prepId && ref.id.startsWith(`rem:${prepId}:proof-`);

/**
Which referenced statements bring their lecture proof into an answer that wants proofs. A proof
outline of the page covers the statements listed before it, and showing the lecture's full proof
as well would give the same proof twice; a statement after the last outline keeps its proof.
*/
export const refsWithProof = (refs: readonly TicketRef[], prepId: string): ReadonlySet<string> => {
  const lastOutline = refs.findLastIndex((ref) => isOwnOutline(ref, prepId));
  return new Set(refs.slice(lastOutline + 1).map((ref) => ref.id));
};
