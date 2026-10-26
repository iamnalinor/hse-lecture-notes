import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COURSES } from "#web/domain/courses.ts";
import { renderWithApp } from "#web/test/render.tsx";

import { CourseCard } from "./course-card.tsx";

const calculus = COURSES.find((course) => course.id === "calculus");

describe("CourseCard", () => {
  it("names an upcoming colloquium without «КР» and dates it by its window", () => {
    if (calculus === undefined) {
      throw new Error("no calculus course");
    }
    renderWithApp(
      <CourseCard
        course={calculus}
        lectures={[]}
        preps={[
          {
            activeUntil: "2026-12-30", highlightFrom: "2026-11-16",
            cheatsheets: [],
            date: "2026-11-02",
            id: "colloq1",
            title: "Подготовка к коллоквиуму 1: матанализ",
          },
        ]}
        today="2026-11-20"
      />,
      "/",
    );
    const tile = screen.getByRole("link", { name: /Подготовка к коллоквиуму 1/u });
    expect(tile).toHaveAttribute("href", "/calculus/colloq1");
    expect(tile).toHaveTextContent("Коллоквиум 1 · 02.11–30.12");
    expect(tile).not.toHaveTextContent("КР");
  });

  it("keeps an upcoming prep outlined until its highlight day, then fills it with the accent", () => {
    if (calculus === undefined) {
      throw new Error("no calculus course");
    }
    const colloq = {
      activeUntil: "2026-12-30",
      cheatsheets: [],
      date: "2026-11-02",
      highlightFrom: "2026-12-07",
      id: "colloq1",
      title: "",
    };
    const { unmount } = renderWithApp(
      <CourseCard course={calculus} lectures={[]} preps={[colloq]} today="2026-10-26" />,
      "/",
    );
    const neutral = screen.getByRole("link", { name: /Подготовка к коллоквиуму 1/u });
    expect(neutral).toHaveTextContent("Коллоквиум 1 · 02.11–30.12");
    expect(neutral).not.toHaveClass("bg-org-fill");
    unmount();
    renderWithApp(
      <CourseCard course={calculus} lectures={[]} preps={[colloq]} today="2026-12-10" />,
      "/",
    );
    expect(screen.getByRole("link", { name: /Подготовка к коллоквиуму 1/u })).toHaveClass(
      "bg-org-fill",
    );
  });
});
