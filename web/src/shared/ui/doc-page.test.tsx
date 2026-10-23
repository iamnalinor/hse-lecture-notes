import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { DocPage } from "./doc-page.tsx";

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
      "/pdf/discrete-kr1-cheatsheet-1side.pdf",
    );
    expect(screen.getByRole("link", { name: "Шпаргалка, 2 стороны" })).toHaveAttribute(
      "href",
      "/pdf/discrete-kr1-cheatsheet-2side.pdf",
    );
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/pdf/discrete-kr1.pdf",
    );
  });
});
