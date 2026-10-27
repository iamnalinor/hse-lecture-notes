import { describe, expect, it } from "vitest";

import type { TicketBank, TicketQuestion } from "./schemas.ts";

import { drawTicket } from "./tickets.ts";

const question = (id: string, kind: string, topic: string): TicketQuestion => ({
  answer: "",
  id,
  kind,
  refs: [],
  text: `<p>${id}</p>`,
  topic,
});

const BANK: TicketBank = {
  about: "",
  questions: [
    question("p1", "proof", "a"),
    question("p2", "proof", "a"),
    question("p3", "proof", "b"),
    question("p4", "proof", "c"),
    question("d1", "definition", "a"),
    question("d2", "definition", "b"),
    question("d3", "definition", "c"),
    question("d4", "definition", "d"),
  ],
  ticket: [
    { count: 2, kind: "proof", points: "2 балла", proofs: true, title: "Теорема" },
    { count: 2, kind: "definition", points: "", proofs: false, title: "Формулировка" },
  ],
  topics: { a: "A", b: "B", c: "C", d: "D" },
};

/** A seeded generator: the same sequence of «random» numbers on every run. */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const ids = (bank: TicketBank, random: () => number) =>
  drawTicket(bank, random).flatMap((part) => part.questions.map((entry) => entry.id));

describe("drawTicket", () => {
  it("follows the ticket format: parts in order, count questions of the part's kind", () => {
    const parts = drawTicket(BANK, seeded(1));
    expect(parts.map((part) => [part.title, part.points, part.proofs])).toStrictEqual([
      ["Теорема", "2 балла", true],
      ["Формулировка", "", false],
    ]);
    expect(parts[0]?.questions.map((entry) => entry.kind)).toStrictEqual(["proof", "proof"]);
    expect(parts[1]?.questions.map((entry) => entry.kind)).toStrictEqual([
      "definition",
      "definition",
    ]);
  });

  it("never repeats a question and takes topics that are not used yet", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const drawn = drawTicket(BANK, seeded(seed)).flatMap((part) => part.questions);
      expect(new Set(drawn.map((entry) => entry.id)).size).toBe(4);
      // four topics, four questions: all of them different
      expect(new Set(drawn.map((entry) => entry.topic)).size).toBe(4);
    }
  });

  it("falls back to a repeated topic when the kind has no other", () => {
    const narrow: TicketBank = {
      ...BANK,
      questions: [question("p1", "proof", "a"), question("p2", "proof", "a")],
      ticket: [{ count: 2, kind: "proof", points: "", proofs: true, title: "Теорема" }],
    };
    expect(ids(narrow, seeded(3)).toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      "p1",
      "p2",
    ]);
  });

  it("gives different tickets for different random numbers", () => {
    const tickets = new Set(
      Array.from({ length: 20 }, (_, seed) => ids(BANK, seeded(seed + 1)).join(",")),
    );
    expect(tickets.size).toBeGreaterThan(1);
  });

  it("returns fewer questions instead of failing when the bank is short", () => {
    const short: TicketBank = { ...BANK, questions: [question("p1", "proof", "a")] };
    expect(ids(short, seeded(1))).toStrictEqual(["p1"]);
  });

  it("takes one variant of a choice item, at random", () => {
    const choice: TicketBank = {
      ...BANK,
      questions: [
        question("c1", "claim", "a"),
        question("d1", "disprove", "b"),
        question("p1", "problem", "c"),
      ],
      ticket: [
        {
          oneOf: [
            [
              { count: 1, kind: "claim", points: "1 балл", proofs: true, title: "Докажите" },
              { count: 1, kind: "disprove", points: "1 балл", proofs: true, title: "Опровергните" },
            ],
            [{ count: 1, kind: "problem", points: "2 балла", proofs: false, title: "Задача" }],
          ],
        },
      ],
    };
    const variants = new Set(
      Array.from({ length: 40 }, (_, seed) => ids(choice, seeded(seed + 1)).join(",")),
    );
    expect(variants).toStrictEqual(new Set(["c1,d1", "p1"]));
    expect(drawTicket(choice, () => 0.99).map((part) => part.title)).toStrictEqual(["Задача"]);
  });
});
