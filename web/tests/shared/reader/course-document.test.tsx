import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import { Component as PrepPage } from "#web/features/prep/page.tsx";
import { Component as ProgramPage } from "#web/features/program/page.tsx";
import { Component as TheoryPage } from "#web/features/theory/page.tsx";

import { renderWithApp } from "../../support/render.tsx";

vi.mock("#web/shared/reader/course-document.tsx", () => ({
  CourseDocument: ({ note, pageName }: { note?: string; pageName: string }) => (
    <header>
      <h1>{pageName}</h1>
      {note}
    </header>
  ),
}));

it.each(["kr2", "exam1", "colloq1", "quiz-limits", "program", "theory"])(
  "omits the small caption from %s",
  (id) => {
    renderWithApp(
      <Routes>
        <Route element={<ProgramPage />} path="/:course/program" />
        <Route element={<TheoryPage />} path="/:course/theory" />
        <Route element={<PrepPage />} path="/:course/:prep" />
      </Routes>,
      `/calculus/${id}`,
      {
        lectures: { calculus: [] },
        preps: { calculus: [{ id, title: "Подготовка", cheatsheets: [] }] },
        programs: ["calculus"],
      },
    );
    const title = screen.getByRole("heading");
    expect(title.parentElement?.textContent).toBe(title.textContent);
  },
);
