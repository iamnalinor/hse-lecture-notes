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

type Draw = { readonly parts: readonly TicketPart[]; readonly taken: readonly TicketQuestion[] };

export const drawTicket = (bank: TicketBank, random: Random = Math.random): readonly TicketPart[] =>
  bank.ticket.reduce<Draw>(
    ({ parts, taken }, { count, kind, points, title }) => {
      const chosen = Array.from({ length: count }).reduce<readonly TicketQuestion[]>(
        (picked) => {
          const next = pick(drawOne(bank.questions, kind, [...taken, ...picked]), random);
          return next === undefined ? picked : [...picked, next];
        },
        [],
      );
      return {
        parts: [...parts, { kind, points, questions: chosen, title }],
        taken: [...taken, ...chosen],
      };
    },
    { parts: [], taken: [] },
  ).parts;
