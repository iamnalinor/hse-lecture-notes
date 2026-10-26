import type { TicketBank, TicketQuestion } from "./schemas.ts";

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
  const questions = drawKind(draw, first.kind, first.count);
  const part = { kind: first.kind, points: first.points, questions, title: first.title };
  return [part, ...drawParts({ ...draw, taken: [...draw.taken, ...questions] }, rest)];
};

export const drawTicket = (bank: TicketBank, random: Random = Math.random): readonly TicketPart[] =>
  drawParts({ bank, random, taken: [] }, bank.ticket);
