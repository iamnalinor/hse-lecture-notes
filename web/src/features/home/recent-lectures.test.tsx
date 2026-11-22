import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COURSES } from "#web/domain/courses.ts";
import { renderWithApp } from "#web/test/render.tsx";

import { RecentLectures } from "./recent-lectures.tsx";

describe("RecentLectures", () => {
  it("opens the lecture from anywhere on the row through the title link", () => {
    const [course] = COURSES;
    if (course === undefined) {
      throw new Error("no courses");
    }
    renderWithApp(
      <RecentLectures
        items={[
          {
            course,
            lecture: { date: "2026-10-23", lecture: 8, synced: [], title: "Ранг", weekId: "08_x" },
          },
        ]}
      />,
    );
    const row = screen.getByRole("row", { name: /Ранг/ });
    const link = within(row).getByRole("link", { name: "Ранг" });
    expect(row).toHaveClass("relative");
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });
});
