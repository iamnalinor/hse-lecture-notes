import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { FragmentView } from "./fragment-view.tsx";

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

  it("keeps the solution behind a button while the answer is open", async () => {
    view(`<div class="nb nb-problem" data-type="problem" data-number="4.26">
      <div class="nb-head"><span class="nb-name">Задача 4.26</span></div>
      <div class="nb-body"><p>Вычислите.</p></div></div>
      <div class="nb-answer"><p>Ответ: 10.</p></div>
      <div class="nb-solution"><p>Решение: долго.</p></div>`);
    expect(screen.getByText("Ответ: 10.")).toBeVisible();
    expect(screen.getByText("Решение: долго.")).not.toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Показать решение/ }));
    expect(screen.getByText("Решение: долго.")).toBeVisible();
  });

  it("hides the answer too on a test preparation page", async () => {
    renderWithApp(
      <FragmentView
        course="algebra"
        docId="kr1"
        html={`<div class="nb nb-problem" data-type="problem" data-number="3">
          <div class="nb-head"><span class="nb-name">Задача 3</span></div>
          <div class="nb-body"><p>Найдите ранг.</p></div></div>
          <div class="nb-answer"><p>Ответ: 2.</p></div>
          <div class="nb-solution"><p>Решение: Гаусс.</p></div>`}
        lecture={undefined}
        variant="prep"
      />,
    );
    expect(screen.getByText("Ответ: 2.")).not.toBeVisible();
    expect(screen.getByText("Решение: Гаусс.")).not.toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Показать ответ/ }));
    expect(screen.getByText("Ответ: 2.")).toBeVisible();
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
