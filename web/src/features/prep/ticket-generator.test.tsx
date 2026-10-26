import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TicketBank } from "#web/domain/schemas.ts";

import { renderWithApp } from "#web/test/render.tsx";

import { TicketGenerator } from "./ticket-generator.tsx";

const LECTURE = "04_sep23_determinant_properties";

const BANK: TicketBank = {
  questions: [
    {
      answer: "",
      id: "laplace",
      kind: "proof",
      refs: [
        { doc: LECTURE, id: "thm:lec04:laplace" },
        { doc: "colloq1", id: "rem:colloq1:proof-laplace" },
      ],
      text: String.raw`<p>Теорема <span class="math inline">\det A</span> Лапласа.</p>`,
      topic: "det",
    },
    {
      answer: "<p>Свой ответ: транспонирование.</p>",
      id: "transpose",
      kind: "definition",
      refs: [{ doc: LECTURE, id: "thm:lec04:laplace" }],
      text: "<p>Что такое транспонирование?</p>",
      topic: "matrix",
    },
  ],
  ticket: [
    {
      count: 1,
      kind: "proof",
      points: "2 балла",
      proofs: true,
      title: "Теорема с доказательством",
    },
    { count: 1, kind: "definition", points: "0,5 балла", proofs: false, title: "Формулировка" },
  ],
  topics: { det: "Определитель", matrix: "Матрицы" },
};

const LECTURE_FRAGMENT = `<p>до</p>
<div id="thm:lec04:laplace" class="nb nb-theorem nb-style-theorem" data-type="theorem" data-number="4.3">
  <div class="nb-head"><span class="nb-name">Теорема 4.3 (разложение Лапласа)</span></div>
  <div class="nb-body"><p>Определитель равен сумме по строке.</p></div>
</div>
<p>Перед доказательством — пара слов.</p>
<div class="nb-proof"><p><em>Доказательство.</em> Индукция по n.</p></div>`;

const PREP_FRAGMENT = `<div id="rem:colloq1:proof-laplace" class="nb nb-remark nb-style-remark" data-type="remark" data-number="7">
  <div class="nb-head"><span class="nb-name">Замечание 7 (ход доказательства)</span></div>
  <div class="nb-body"><p>Индукция по порядку.</p></div>
</div>`;

const FILES: Readonly<Record<string, string>> = {
  [`algebra/${LECTURE}/fragment.html`]: LECTURE_FRAGMENT,
  "algebra/colloq1/bank.json": JSON.stringify(BANK),
  "algebra/colloq1/fragment.html": PREP_FRAGMENT,
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const body = FILES[(input as string).replace(/^.*\/data\//u, "")];
    return Promise.resolve(
      body === undefined ? new Response("", { status: 404 }) : new Response(body),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const view = () =>
  renderWithApp(<TicketGenerator course="algebra" prepId="colloq1" />, "/algebra/colloq1");

const newTicket = async () => {
  const button = await screen.findByRole("button", { name: "Новый билет" });
  await vi.waitFor(() => {
    expect(button).toBeEnabled();
  });
  await userEvent.click(button);
};

describe("TicketGenerator", () => {
  it("draws a ticket only on «Новый билет», in the format of the bank", async () => {
    view();
    expect(await screen.findByText(/из 2 вопросов/u)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();

    await newTicket();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^1\.Теорема/u);
    expect(items[1]).toHaveTextContent(/^2\.Что такое транспонирование/u);
    expect(screen.getByText("Теорема с доказательством")).toBeInTheDocument();
    expect(screen.getByText("2 балла")).toBeInTheDocument();
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("links each question to its section of the page", async () => {
    view();
    await newTicket();
    expect(screen.getByRole("link", { name: "К разделу «Определитель»" })).toHaveAttribute(
      "href",
      "/algebra/colloq1#sec:colloq1:det",
    );
  });

  it("reveals the referenced blocks in place, without their ids", async () => {
    view();
    await newTicket();
    const [proof] = screen.getAllByRole("listitem");
    if (proof === undefined) {
      throw new Error("no question");
    }
    expect(within(proof).queryByText("Определитель равен сумме по строке.")).toBeNull();

    await userEvent.click(within(proof).getByRole("button", { name: "Ответ на вопрос 1" }));
    expect(await within(proof).findByText("Определитель равен сумме по строке.")).toBeVisible();
    expect(await within(proof).findByText("Индукция по порядку.")).toBeVisible();
    expect(within(proof).getByText("Теорема 4.3")).toBeInTheDocument();
    expect(within(proof).getByRole("link", { name: "Лекция 4 →" })).toHaveAttribute(
      "href",
      `/algebra/${LECTURE}#thm:lec04:laplace`,
    );
    expect(within(proof).getByRole("link", { name: "На этой странице ↑" })).toHaveAttribute(
      "href",
      "/algebra/colloq1#rem:colloq1:proof-laplace",
    );
    expect(document.querySelector('[id="thm:lec04:laplace"]')).toBeNull();
    // a theorem with proof: the proof that follows the statement comes along
    expect(within(proof).getByText(/Индукция по n/u)).toBeInTheDocument();
    expect(within(proof).queryByText(/пара слов/u)).toBeNull();
  });

  it("shows an own answer, and a new ticket starts with answers closed", async () => {
    view();
    await newTicket();
    const definition = screen.getAllByRole("listitem")[1];
    if (definition === undefined) {
      throw new Error("no question");
    }
    await userEvent.click(within(definition).getByRole("button", { name: "Ответ на вопрос 2" }));
    expect(within(definition).getByText("Свой ответ: транспонирование.")).toBeVisible();
    // a formulation question: the statement only, no proof
    expect(
      await within(definition).findByText("Определитель равен сумме по строке."),
    ).toBeVisible();
    expect(within(definition).queryByText(/Индукция по n/u)).toBeNull();

    await newTicket();
    expect(screen.queryByText("Свой ответ: транспонирование.")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /^Ответ на вопрос/u });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getByText("Билет 2: 2 вопроса")).toBeInTheDocument();
  });
});
