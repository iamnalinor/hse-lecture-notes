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
    expect(algebra).toHaveTextContent("Матеша");
    expect(algebra).toHaveTextContent("8 кредитов");
    expect(algebra).toHaveTextContent("28 ч28 ч44 ч44 ч");
    expect(algebra).toHaveTextContent("аттестация в 2 и 4 модулях");
    expect(within(table).getByRole("row", { name: /Всего/u, hidden: true })).toHaveTextContent(
      "38 ч42 ч64 ч44 ч",
    );
  });

  it("hints the share of the module on a bar and marks the attestation", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(
      screen.getByTitle("28 ч — 74% часов модуля · 8 кредитов за год · аттестация в 2 и 4 модулях"),
    ).toBeInTheDocument();
    expect(screen.getAllByTitle("аттестация в 4 модуле")).toHaveLength(1);
  });

  it("shows the practice as a note without bars and the seminar as one of many", () => {
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(screen.getByText(/без часов по модулям · срок фиксированный/u)).toBeInTheDocument();
    expect(screen.getByText(/один из 11/u)).toBeInTheDocument();
    expect(screen.getAllByText("Прога")).toHaveLength(3);
  });

  it("marks the current module by its header only when its dates are known", () => {
    const { unmount } = renderWithApp(<StudyPlan curriculum={SAMPLE} today="2026-11-22" />, "/");
    expect(screen.getByText("идёт сейчас")).toBeInTheDocument();
    unmount();
    renderWithApp(<StudyPlan curriculum={SAMPLE} today="2027-02-01" />, "/");
    expect(screen.queryByText("идёт сейчас")).not.toBeInTheDocument();
  });
});
