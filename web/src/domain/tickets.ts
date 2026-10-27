import type { TicketBank, TicketQuestion } from "./schemas.ts";

/**
A random ticket from the bank of a preparation page (`prep/<course>/<prep>-bank.yaml`): its parts go
in the order of `ticket`, each with `count` questions of its kind. Questions of one ticket come from
different topics while the bank allows it; otherwise any unused question of the kind is taken. A
question of weight 2 comes up twice as often as one of weight 1.
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

/** A question at random, each as likely as `weight` copies of a question of weight 1. */
const pickWeighted = (
  questions: readonly TicketQuestion[],
  random: Random,
): TicketQuestion | undefined =>
  pick(
    questions.flatMap((question) => Array.from({ length: question.weight }, () => question)),
    random,
  );

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
  const next = pickWeighted(drawOne(draw.bank.questions, kind, draw.taken), draw.random);
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
    // a choice of variants (problem: two short items or one problem): one of them, then the rest
    return drawParts(draw, [...(pick(first.oneOf, draw.random) ?? []), ...rest]);
  }
  const questions = drawKind(draw, first.kind, first.count);
  const { kind, points, proofs, title } = first;
  const part = { kind, points, proofs, questions, title };
  return [part, ...drawParts({ ...draw, taken: [...draw.taken, ...questions] }, rest)];
};

export const drawTicket = (bank: TicketBank, random: Random = Math.random): readonly TicketPart[] =>
  drawParts({ bank, random, taken: [] }, bank.ticket);
