import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudyPlan } from "#web/features/home/study-plan/view.tsx";

import { SAMPLE } from "../../../support/curriculum-fixture.ts";
import { renderWithApp } from "../../../support/render.tsx";

describe("StudyPlan", () => {
  it("gives screen readers the numbers as a table, with a total row", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
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
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(
      screen.getByTitle("28 ч · 3,5 ч/нед — 43% часов модуля · 8 кредитов за год"),
    ).toBeInTheDocument();
    expect(screen.queryByText("аттестация в модуле")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/^аттестация/u)).not.toBeInTheDocument();
  });

  it("states what each credit total includes", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(
      screen.getByText(
        /Кредиты за год: 21 по дисциплинам выше · 24 с учебной практикой и физкультурой · 32 с английским/u,
      ),
    ).toBeInTheDocument();
  });

  it("says the shading scale in hours per week in the legend", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(screen.getByText(/больше \(до 4,2 ч\/нед\)/u)).toBeInTheDocument();
  });

  it("centers the legend and the caption", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(screen.getByText(/меньше часов/u).closest("div")).toHaveClass("justify-center");
    expect(screen.getByText(/^Кредиты за год:/u)).toHaveClass("text-center");
  });

  it("joins neighbouring modules into one bar and keeps a gap as two", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    // algebra: four neighbours → one bar with four segments
    const algebra = screen.getByTitle(
      "28 ч · 3,5 ч/нед — 43% часов модуля · 8 кредитов за год",
    ).parentElement;
    expect(algebra?.children).toHaveLength(4);
    // labels → bar wrapper → grid cell of the run
    expect(algebra?.parentElement?.parentElement).toHaveStyle({ gridColumn: "2 / span 4" });
    // gap: modules 1, then 3–4 → two bars
    const gap = screen.getAllByTitle(/1 кредит за год/u);
    expect(gap).toHaveLength(3);
    expect(gap[0]?.parentElement).not.toBe(gap[1]?.parentElement);
    expect(gap[1]?.parentElement).toBe(gap[2]?.parentElement);
    // the coloured bar is the labels' sibling
    expect((algebra?.previousElementSibling as HTMLElement | null)?.style.background).toContain(
      "linear-gradient",
    );
  });

  it("keeps «один из N» for the seminar in the tooltip only, and shows the full category names", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(screen.queryByText(/один из 11/u)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/один из 11 семинаров/u)).toHaveLength(3);
    expect(screen.getAllByText("Программирование")).toHaveLength(5);
    expect(screen.queryByText("Прога")).not.toBeInTheDocument();
    expect(screen.queryByText(/срок фиксированный/u)).not.toBeInTheDocument();
  });

  it("marks the current module by its header only when its dates are known", () => {
    const { unmount } = renderWithApp(<StudyPlan curriculum={SAMPLE} today="2026-11-22" />, "/");
    expect(screen.getByText("идёт сейчас")).toBeInTheDocument();
    unmount();
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-01-05" />, "/");
    expect(screen.queryByText("идёт сейчас")).not.toBeInTheDocument();
  });
});
