import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useNavigate } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { FragmentView } from "#web/shared/reader/fragment-view.tsx";

import { renderWithApp } from "../../support/render.tsx";

const view = (html: string) =>
  renderWithApp(<FragmentView course="algebra" docId="04_x" html={html} lecture={4} />);

const THEOREM = `
<div id="thm:lec04:laplace" class="nb nb-theorem nb-style-theorem" data-type="theorem" data-number="4.3">
  <div class="nb-head"><span class="nb-name">Теорема 4.3 (разложение Лапласа)</span></div>
  <div class="nb-body"><p>Определитель равен сумме.</p></div>
</div>`;

describe("FragmentView blocks", () => {
  it("draws the label and the title of a theorem", () => {
    view(THEOREM);
    expect(screen.getByText("Теорема 4.3")).toBeInTheDocument();
    expect(screen.getByText("разложение Лапласа")).toBeInTheDocument();
    expect(screen.getByText("Определитель равен сумме.")).toBeInTheDocument();
    expect(document.querySelector(String.raw`#thm\:lec04\:laplace`)).not.toBeNull();
  });

  it("shows a remark tag as a pill instead of a title", () => {
    view(`<div class="nb nb-remark nb-style-remark" data-type="remark" data-tag="pitfall" data-number="4.2">
      <div class="nb-head"><span class="nb-name">Замечание 4.2 (подводный камень)</span></div>
      <div class="nb-body"><p>Осторожно.</p></div></div>`);
    expect(screen.getAllByText("подводный камень")).toHaveLength(1);
    expect(screen.getByTestId("tag-pill")).toHaveTextContent("подводный камень");
  });
});

describe("FragmentView references and math", () => {
  it("links a reference to the lecture of its target", () => {
    view(
      '<p>см. <a href="../x/#y" class="ref" data-ref="def:lec02:transpose">2.9 (лекция 2)</a></p>',
    );
    expect(screen.getByRole("link", { name: "2.9 (лекция 2)" })).toHaveAttribute(
      "href",
      "/algebra/02_sep09_gauss_method#def:lec02:transpose",
    );
  });

  it("renders TeX with KaTeX using the course macros", () => {
    view(String.raw`<p><span class="math inline">x \in \R</span></p>`);
    expect(document.querySelector(".katex")).not.toBeNull();
    expect(document.querySelector(".katex-error")).toBeNull();
  });

  it("renders the row notation of elementary transformations", () => {
    view(String.raw`<p><span class="math inline">\rw{I} - 2 \cdot \rw{II}</span></p>`);
    expect(document.querySelector(".katex-error")).toBeNull();
    expect(document.querySelectorAll(".katex-html .overline-line")).toHaveLength(2);
    expect(document.querySelectorAll(".katex-html .underline-line")).toHaveLength(2);
  });
});

describe("FragmentView proofs and problems", () => {
  it("collapses long proofs and keeps short ones open", () => {
    const long = `<div class="nb-proof"><p>${"слово ".repeat(200)}</p></div>`;
    view(`${long}<div class="nb-proof"><p>Коротко.</p></div>`);
    const [first, second] = [...document.querySelectorAll("details")];
    expect(first?.open).toBe(false);
    expect(second?.open).toBe(true);
  });

  it("shows the proof title in the summary, not in the body", () => {
    const body = "слово ".repeat(200);
    view(`<div class="nb-proof"><p><em>Доказательство теоремы Лапласа.</em> ${body}</p></div>
      <div class="nb-proof"><p><em>Доказательство.</em> Коротко.</p></div>`);
    const summaries = [...document.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries[0]).toContain("Доказательство теоремы Лапласа.");
    expect(summaries[1]).toContain("Доказательство.");
    const bodies = [...document.querySelectorAll("details > div")].map((d) => d.textContent);
    expect(bodies.join(" ")).not.toContain("Доказательство");
  });

  it("keeps a reference in the proof title as text and drops a lead-only paragraph", () => {
    view(`<div class="nb-proof"><p><em>Доказательство теоремы <a href="#thm:x" class="ref" data-ref="thm:x">6.2</a>.</em></p>
      <span class="math display">x = 1</span></div>`);
    const summary = document.querySelector("summary");
    expect(summary?.textContent).toContain("Доказательство теоремы 6.2.");
    expect(summary?.querySelector("a")).toBeNull();
    expect(document.querySelector("details > div p")).toBeNull();
  });

  it("keeps the solution, its answer in the last line, behind a button", async () => {
    view(`<div class="nb nb-problem" data-type="problem" data-number="4.26">
      <div class="nb-head"><span class="nb-name">Задача 4.26</span></div>
      <div class="nb-body"><p>Вычислите.</p></div></div>
      <div class="nb-solution"><p>Решение: долго.</p><p>Ответ: 10.</p></div>`);
    expect(screen.getByText("Решение: долго.")).not.toBeVisible();
    expect(screen.getByText("Ответ: 10.")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: /Показать ответ/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Решение" }));
    expect(screen.getByText("Ответ: 10.")).toBeVisible();
  });

  it("links a test preparation page's own labels to anchors on the page", () => {
    renderWithApp(
      <FragmentView
        course="algebra"
        docId="kr1"
        html={'<p>См. <a href="#prob:kr1:rank" class="ref" data-ref="prob:kr1:rank">3</a>.</p>'}
        lecture={undefined}
        variant="prep"
      />,
    );
    expect(screen.getByRole("link", { name: "3" })).toHaveAttribute(
      "href",
      expect.stringMatching(/#prob:kr1:rank$/u),
    );
  });
});

const TABLE = `
<table>
  <colgroup><col style="width: 30%" /><col style="width: 10%" /><col style="width: 60%" /></colgroup>
  <thead><tr class="header"><th>Элемент</th><th>Вес</th><th>Что это</th></tr></thead>
  <tbody><tr class="odd"><td>КР</td><td>0,2</td><td>одна пара</td></tr></tbody>
</table>`;

describe("FragmentView tables", () => {
  it("labels every cell of a wide program table for the phone cards", () => {
    renderWithApp(
      <FragmentView
        course="discrete"
        docId="program"
        html={TABLE}
        lecture={undefined}
        variant="program"
      />,
    );
    expect(document.querySelector(".table-cards")).not.toBeNull();
    const cells = [...document.querySelectorAll("td")].map((td) => td.dataset["label"]);
    expect(cells).toStrictEqual(["Элемент", "Вес", "Что это"]);
    expect(document.querySelectorAll("td[data-inline]")).toHaveLength(3);
    expect(screen.getByRole("columnheader", { name: "Вес" })).toBeInTheDocument();
    // cards are display: block on a phone: the table roles are explicit
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "0,2" })).toBeInTheDocument();
    expect(document.querySelector(".table-cards")).toHaveClass("overflow-x-auto");
  });

  it("keeps a two-column program table and lecture tables as plain scrolling tables", () => {
    view(TABLE);
    expect(document.querySelector(".table-cards")).toBeNull();
    expect(document.querySelector("td[data-label]")).toBeNull();
    renderWithApp(
      <FragmentView
        course="discrete"
        docId="program"
        html="<table><thead><tr><th>Когда</th><th>Что</th></tr></thead><tbody><tr><td>24.10</td><td>КР1</td></tr></tbody></table>"
        lecture={undefined}
        variant="program"
      />,
    );
    expect(document.querySelector(".table-cards")).toBeNull();
  });
});

describe("FragmentView slots", () => {
  it("mounts React content at the end of the section with that id", () => {
    renderWithApp(
      <FragmentView
        course="algebra"
        docId="colloq1"
        html={
          '<section id="sec:colloq1:generator"><h1>Генератор билетов</h1></section><section id="other"><p>Дальше.</p></section>'
        }
        lecture={undefined}
        slots={
          new Map([
            [
              "sec:colloq1:generator",
              <button key="slot" type="button">
                Сгенерировать
              </button>,
            ],
          ])
        }
        variant="prep"
      />,
    );
    const section = document.querySelector('[id="sec:colloq1:generator"]');
    expect(section).toContainElement(screen.getByRole("button", { name: "Сгенерировать" }));
    expect(document.querySelector('[id="other"]')).not.toContainElement(
      screen.getByRole("button", { name: "Сгенерировать" }),
    );
  });
});

const TICKETS_HTML = `
<section id="билеты" class="level1">
  <h1>Билеты</h1>
  <section id="sec:exam1:laplace" class="level2">
    <h2>1. Разложение определителя по строке</h2>
    <div id="rem:exam1:proof-laplace" class="nb nb-remark nb-style-remark" data-type="remark" data-number="1">
      <div class="nb-head"><span class="nb-name">Замечание 1 (доказательство)</span></div>
      <div class="nb-body"><p>Шаг 1. Линейность по строке.</p></div>
    </div>
  </section>
  <section id="sec:exam1:lu" class="level2">
    <h2>2. <span class="math inline">LU</span>-разложение</h2>
    <p>Условие главных миноров.</p>
  </section>
</section>
<section id="задачи" class="level1">
  <h1>Задачи</h1>
  <section id="sec:exam1:rank" class="level2">
    <h2>1. Ранг матрицы</h2>
    <p>Привести к ступенчатому виду.</p>
  </section>
</section>`;

const LectureStub = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void navigate(-1);
      }}
      type="button"
    >
      Назад
    </button>
  );
};

describe("FragmentView ticket list", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("folds tickets in «Билеты» on prep pages into a compact list and opens them on click", async () => {
    renderWithApp(
      <FragmentView
        course="algebra"
        docId="exam1"
        html={TICKETS_HTML}
        lecture={undefined}
        variant="prep"
      />,
    );

    const details = [...document.querySelectorAll<HTMLDetailsElement>("section#билеты details")];
    expect(details).toHaveLength(2);
    expect(details[0]?.open).toBe(false);
    expect(details[1]?.open).toBe(false);

    // Leading numbers are split into tabular columns, math inside titles still renders.
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("Разложение определителя по строке")).toBeInTheDocument();
    expect(document.querySelector("section#билеты .katex")).not.toBeNull();

    // Non-ticket sections («Задачи») stay open as regular prose sections.
    expect(document.querySelector("section#задачи details")).toBeNull();
    expect(screen.getByText("Привести к ступенчатому виду.")).toBeVisible();

    await userEvent.click(screen.getByText("Разложение определителя по строке"));
    expect(details[0]?.open).toBe(true);
    expect(details[1]?.open).toBe(false);
  });

  it("expands and collapses all tickets with the bulk buttons", async () => {
    renderWithApp(
      <FragmentView
        course="algebra"
        docId="exam1"
        html={TICKETS_HTML}
        lecture={undefined}
        variant="prep"
      />,
    );

    const expandAll = screen.getByRole("button", { name: "Раскрыть все" });
    const collapseAll = screen.getByRole("button", { name: "Свернуть все" });
    const details = [...document.querySelectorAll<HTMLDetailsElement>("section#билеты details")];

    expect(expandAll).toBeEnabled();
    expect(collapseAll).toBeDisabled();

    await userEvent.click(expandAll);
    expect(details.every((item) => item.open)).toBe(true);
    expect(expandAll).toBeDisabled();
    expect(collapseAll).toBeEnabled();

    await userEvent.click(collapseAll);
    expect(details.every((item) => !item.open)).toBe(true);
    expect(expandAll).toBeEnabled();
    expect(collapseAll).toBeDisabled();
  });

  it("restores open tickets after navigating to a lecture and going back", async () => {
    const htmlWithRef = TICKETS_HTML.replace(
      "<p>Шаг 1. Линейность по строке.</p>",
      '<p>См. <a href="../x/#y" class="ref" data-ref="def:lec02:transpose">2.9 (лекция 2)</a>.</p>',
    );
    renderWithApp(
      <Routes>
        <Route
          element={
            <FragmentView
              course="algebra"
              docId="exam1"
              html={htmlWithRef}
              lecture={undefined}
              variant="prep"
            />
          }
          path="/algebra/exam1"
        />
        <Route element={<LectureStub />} path="/algebra/02_sep09_gauss_method" />
      </Routes>,
      "/algebra/exam1",
    );

    await userEvent.click(screen.getByText("Разложение определителя по строке"));
    await userEvent.click(screen.getByRole("link", { name: "2.9 (лекция 2)" }));
    expect(screen.queryByText("Разложение определителя по строке")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    const details = [...document.querySelectorAll<HTMLDetailsElement>("section#билеты details")];
    expect(details[0]?.open).toBe(true);
    expect(details[1]?.open).toBe(false);
    expect(screen.getByRole("button", { name: "Свернуть все" })).toBeEnabled();
  });

  it("does not fold «Билеты» outside prep pages", () => {
    view(TICKETS_HTML);
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });
});
