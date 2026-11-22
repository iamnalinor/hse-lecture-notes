import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SAMPLE } from "#web/test/curriculum-fixture.ts";
import { renderWithApp } from "#web/test/render.tsx";

import { StudyPlan } from "./study-plan.tsx";

describe("StudyPlan", () => {
  it("gives screen readers the numbers as a table, with a total row", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    const table = screen.getByRole("table", { hidden: true });
    const algebra = within(table).getByRole("row", { name: /Алгебра/u, hidden: true });
    expect(algebra).toHaveTextContent("Математика");
    expect(algebra).toHaveTextContent("8 кредитов");
    expect(algebra).toHaveTextContent("28 ч28 ч44 ч44 ч");
    expect(algebra).toHaveTextContent("аттестация в 2 и 4 модулях");
    expect(within(table).getByRole("row", { name: /Всего/u, hidden: true })).toHaveTextContent(
      "65 ч60 ч113 ч93 ч",
    );
  });

  it("hints the share of the module on a bar, without attestation dots", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(screen.getByTitle("28 ч — 43% часов модуля · 8 кредитов за год")).toBeInTheDocument();
    expect(screen.queryByText("аттестация в модуле")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/^аттестация/u)).not.toBeInTheDocument();
  });

  it("states what each credit total includes", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(
      screen.getByText(
        /Кредиты за год: 21 по дисциплинам выше · 24 с учебной практикой и физкультурой · 32 с английским/u,
      ),
    ).toBeInTheDocument();
  });

  it("joins neighbouring modules into one bar and keeps a gap as two", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    // algebra: four neighbours → one bar with four segments
    const algebra = screen.getByTitle("28 ч — 43% часов модуля · 8 кредитов за год").parentElement;
    expect(algebra?.children).toHaveLength(4);
    expect(algebra?.parentElement).toHaveStyle({ gridColumn: "2 / span 4" });
    // gap: modules 1, then 3–4 → two bars
    const gap = screen.getAllByTitle(/1 кредит за год/u);
    expect(gap).toHaveLength(3);
    expect(gap[0]?.parentElement).not.toBe(gap[1]?.parentElement);
    expect(gap[1]?.parentElement).toBe(gap[2]?.parentElement);
    expect(algebra?.style.background).toContain("linear-gradient");
  });

  it("shows the seminar as one of many and the full category names", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(screen.getByText(/один из 11/u)).toBeInTheDocument();
    expect(screen.getAllByText("Программирование")).toHaveLength(5);
    expect(screen.queryByText("Прога")).not.toBeInTheDocument();
    expect(screen.queryByText(/срок фиксированный/u)).not.toBeInTheDocument();
  });

  it("marks the current module by its header only when its dates are known", () => {
    const { unmount } = renderWithApp(<StudyPlan curriculum={SAMPLE} today="2026-11-22" />, "/");
    expect(screen.getByText("идёт сейчас")).toBeInTheDocument();
    unmount();
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(screen.queryByText("идёт сейчас")).not.toBeInTheDocument();
  });
});
