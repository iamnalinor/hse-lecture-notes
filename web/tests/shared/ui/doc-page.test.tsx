import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocPage } from "#web/shared/ui/doc-page.tsx";

import { renderWithApp } from "../../support/render.tsx";

describe("DocPage downloads", () => {
  it("offers the cheatsheet PDFs next to the document's own", () => {
    renderWithApp(
      <DocPage
        course="discrete"
        courseName="Дискретная математика"
        downloads={[
          { docId: "kr1-cheatsheet-1side", label: "Шпаргалка, 1 сторона" },
          { docId: "kr1-cheatsheet-2side", label: "Шпаргалка, 2 стороны" },
        ]}
        pageName="Подготовка к КР-1"
        pdfDoc="kr1"
      >
        <p>Текст</p>
      </DocPage>,
      "/discrete/kr1",
    );
    expect(screen.getByRole("link", { name: "Шпаргалка, 1 сторона" })).toHaveAttribute(
      "href",
      "/pdf/discrete_kr1_cheatsheet_1side.pdf",
    );
    expect(screen.getByRole("link", { name: "Шпаргалка, 2 стороны" })).toHaveAttribute(
      "href",
      "/pdf/discrete_kr1_cheatsheet_2side.pdf",
    );
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/pdf/discrete_kr1.pdf",
    );
  });
});

describe("DocPage jump link", () => {
  it("links to a section of the page next to the PDF button", () => {
    renderWithApp(
      <DocPage
        course="calculus"
        courseName="Матан"
        jump={{ hash: "ticket-generator", label: "К генератору билетов" }}
        pageName="Подготовка к коллоквиуму"
        pdfDoc="colloq1"
      >
        <p>Текст</p>
      </DocPage>,
      "/calculus/colloq1",
    );
    expect(screen.getByRole("link", { name: "К генератору билетов" })).toHaveAttribute(
      "href",
      "/calculus/colloq1#ticket-generator",
    );
  });
});
