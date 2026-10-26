import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { Component as CoursePage } from "./course-page.tsx";

const prep = (id: string, date: string, activeUntil: string, highlightFrom: string) => ({
  activeUntil,
  cheatsheets: [],
  date,
  highlightFrom,
  id,
  title: "",
});

const LECTURES = [
  { date: "2026-10-16", lecture: 7, title: "Предел функции", weekId: "07_oct16_limits" },
  { date: "2026-10-23", lecture: 8, title: "Непрерывность", weekId: "08_oct23_continuity" },
  { date: "2026-10-30", lecture: 9, title: "Производная", weekId: "09_oct30_derivative" },
];

const PREPS = [
  prep("kr1", "2026-10-22", "2026-10-23", "2026-10-08"),
  prep("colloq1", "2026-11-02", "2026-12-30", "2026-12-07"),
  prep("kr2", "2026-12-10", "2026-12-10", "2026-11-26"),
];

/** The calculus page on a given Moscow day. */
const calculusOn = (day: string) => {
  vi.useFakeTimers({ now: new Date(`${day}T12:00:00+03:00`), toFake: ["Date"] });
  renderWithApp(
    <Routes>
      <Route element={<CoursePage />} path=":course" />
    </Routes>,
    "/calculus",
    { lectures: { calculus: LECTURES }, preps: { calculus: PREPS }, programs: [] },
  );
};

const navLinks = (name: string) =>
  screen
    .getByRole("navigation", { name })
    .querySelectorAll("a")
    .values()
    .map((link) => link.textContent)
    .toArray();

const page = (programs: readonly string[]) => {
  renderWithApp(
    <Routes>
      <Route element={<CoursePage />} path=":course" />
    </Routes>,
    "/discrete",
    { lectures: { discrete: [] }, preps: {}, programs: [...programs] },
  );
};

describe("course page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("links the program page of the course next to the theory", () => {
    page(["discrete"]);
    expect(screen.getByRole("link", { name: "Программа и оценивание" })).toHaveAttribute(
      "href",
      "/discrete/program",
    );
    expect(screen.getByRole("link", { name: "Теория" })).toBeInTheDocument();
  });

  it("has no program link when the course has no such page", () => {
    page(["algebra"]);
    expect(screen.queryByRole("link", { name: "Программа и оценивание" })).toBeNull();
  });

  it("puts the latest lecture with its day first, then the course documents", () => {
    calculusOn("2026-10-26");
    expect(screen.getByRole("link", { name: /Читать лекцию 8/u })).toHaveAttribute(
      "href",
      "/calculus/08_oct23_continuity",
    );
    expect(navLinks("Материалы курса")).toStrictEqual([
      "Читать лекцию 8· 23 окт→",
      "Теория",
      "Глоссарий",
    ]);
  });

  it("lists only the preps still ahead in a row of their own, neutral far from the event", () => {
    calculusOn("2026-10-26");
    expect(navLinks("Подготовка к контрольным")).toStrictEqual([
      "Подготовка к коллоквиуму 1",
      "Подготовка к КР-2",
    ]);
    expect(screen.getByRole("link", { name: "Подготовка к коллоквиуму 1" })).not.toHaveClass(
      "bg-org-fill",
    );
    expect(screen.queryByRole("link", { name: "Подготовка к КР-1" })).toBeNull();
  });

  it("orders the preps by the next day that matters and accents those near the event", () => {
    calculusOn("2026-12-08");
    expect(navLinks("Подготовка к контрольным")).toStrictEqual([
      "Подготовка к КР-2",
      "Подготовка к коллоквиуму 1",
    ]);
    expect(screen.getByRole("link", { name: "Подготовка к КР-2" })).toHaveClass("bg-org-fill");
    expect(screen.getByRole("link", { name: "Подготовка к коллоквиуму 1" })).toHaveClass(
      "bg-org-fill",
    );
  });

  it("drops the prep row when nothing is ahead", () => {
    calculusOn("2026-12-31");
    expect(screen.queryByRole("navigation", { name: "Подготовка к контрольным" })).toBeNull();
  });
});
