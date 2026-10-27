import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { renderWithApp } from "#web/test/render.tsx";

import { Component as ProgramPage } from "./program-page.tsx";

describe("program page", () => {
  it("throws a 404 for the router when the course has no program page", () => {
    // React logs the error thrown during render; the router's error boundary handles it in the app
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      renderWithApp(
        <Routes>
          <Route element={<ProgramPage />} path=":course/program" />
        </Routes>,
        "/algebra/program",
        { lectures: { algebra: [] }, preps: {}, programs: ["discrete"] },
      ),
    ).toThrow(expect.objectContaining({ status: 404 }));
    consoleError.mockRestore();
  });
});
