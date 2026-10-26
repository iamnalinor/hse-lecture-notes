import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { Component as CoursePage } from "./course-page.tsx";

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
});
