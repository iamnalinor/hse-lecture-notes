import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TicketBank } from "#web/domain/schemas.ts";

import { TicketGenerator } from "#web/features/prep/tickets/generator.tsx";

import { renderWithApp } from "../../../support/render.tsx";

const LECTURE = "04_sep23_determinant_properties";

const BANK: TicketBank = {
  about: "Набор для тренировки: теорема и формулировка.",
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

it("renders formulas in topic titles", async () => {
  const bank = { ...BANK, topics: { det: "Определитель $\\det A$", matrix: "Матрицы" } };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(bank));
  renderWithApp(<TicketGenerator course="algebra" prepId="colloq1" />, "/algebra/colloq1");
  expect(await screen.findByText("Темы: все 2")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Определитель/u }).querySelector(".katex"),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: /Определитель/u })).not.toHaveTextContent("$");
});

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
  "algebra/kr1/bank.json": JSON.stringify(BANK),
  "algebra/kr1/fragment.html": "",
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
  localStorage.clear();
});

const view = () =>
  renderWithApp(<TicketGenerator course="algebra" prepId="colloq1" />, "/algebra/colloq1");

const newTicket = async () => {
  const button = await screen.findByRole("button", { name: "Сгенерировать" });
  await vi.waitFor(() => {
    expect(button).toBeEnabled();
  });
  await userEvent.click(button);
};

describe("TicketGenerator", () => {
  it("draws a ticket only on «Сгенерировать», in the format of the bank", async () => {
    view();
    expect(
      await screen.findByText("Набор для тренировки: теорема и формулировка. В банке 2 вопроса."),
    ).toBeInTheDocument();
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

  it("scrolls the new ticket into view and moves focus to its heading", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    view();
    await newTicket();
    const heading = screen.getByRole("heading", { name: "Билет 1" });
    expect(heading).toHaveFocus();
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
    await newTicket();
    expect(screen.getByRole("heading", { name: "Билет 2" })).toHaveFocus();
  });

  it("scrolls without animation under prefers-reduced-motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    view();
    await newTicket();
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
    vi.unstubAllGlobals();
  });

  it("draws only from the chosen topics, and «Сбросить все» leaves nothing to draw", async () => {
    view();
    expect(await screen.findByText("Темы: все 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Определитель" }));
    expect(screen.getByRole("button", { name: "Определитель" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("Темы: 1 из 2")).toBeInTheDocument();
    await newTicket();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Теорема с доказательством")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Сбросить все" }));
    expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сгенерировать" })).toHaveAccessibleDescription(
      "Выбери хотя бы одну тему.",
    );
  });

  it("keeps the chosen topics after a reload", async () => {
    const first = view();
    expect(await screen.findByText("Темы: все 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Матрицы" }));
    first.unmount();
    view();
    expect(await screen.findByText("Темы: 1 из 2")).toBeInTheDocument();
  });

  it("links each question to its section of the page", async () => {
    view();
    await newTicket();
    expect(screen.getByRole("link", { name: "К разделу «Определитель»" })).toHaveAttribute(
      "href",
      "/algebra/colloq1#sec:colloq1:det",
    );
  });

  it("writes the answer out as one text, with the sources as links under it", async () => {
    view();
    await newTicket();
    const [proof] = screen.getAllByRole("listitem");
    if (proof === undefined) {
      throw new Error("no question");
    }
    expect(within(proof).queryByText("Определитель равен сумме по строке.")).toBeNull();

    await userEvent.click(within(proof).getByRole("button", { name: "Ответ на вопрос 1" }));
    expect(await within(proof).findByText("Определитель равен сумме по строке.")).toBeVisible();
    expect(within(proof).getByText("Индукция по порядку.")).toBeVisible();
    // no cards: the blocks' headers are not drawn, only named in the links
    expect(within(proof).queryByText("Теорема 4.3")).toBeNull();
    expect(proof.querySelector(".nb")).toBeNull();
    expect(
      within(proof).getByRole("link", { name: "Теорема 4.3 (разложение Лапласа), лекция 4 →" }),
    ).toHaveAttribute("href", `/algebra/${LECTURE}#thm:lec04:laplace`);
    expect(
      within(proof).getByRole("link", { name: "Замечание 7 (ход доказательства) ↑" }),
    ).toHaveAttribute("href", "/algebra/colloq1#rem:colloq1:proof-laplace");
    expect(document.querySelector('[id="thm:lec04:laplace"]')).toBeNull();
    // the page outlines the proof, so the lecture's own proof is not shown a second time
    expect(within(proof).queryByText(/Индукция по n/u)).toBeNull();
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

  it("on a test page draws variants, not tickets", async () => {
    renderWithApp(<TicketGenerator course="algebra" prepId="kr1" />, "/algebra/kr1");
    expect(screen.getByRole("region", { name: "Генератор вариантов" })).toBeInTheDocument();
    await newTicket();
    expect(screen.getByText("Вариант 1: 2 вопроса")).toBeInTheDocument();
  });
});
