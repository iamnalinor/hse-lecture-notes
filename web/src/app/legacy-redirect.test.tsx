import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { LegacyTheoryRedirect } from "./legacy-redirect.tsx";

const open = (entry: string) => {
  const router = createMemoryRouter(
    [
      { Component: LegacyTheoryRedirect, path: ":course/registry" },
      { element: <p>теория</p>, path: ":course/theory" },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe("LegacyTheoryRedirect", () => {
  it("moves an old theory link to the new address with its block anchor", async () => {
    const router = open("/algebra/registry#reg-def:lec01:zero");
    expect(await screen.findByText("теория")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/algebra/theory");
    expect(router.state.location.hash).toBe("#reg-def:lec01:zero");
  });

  it("replaces the old entry instead of adding one", async () => {
    const router = open("/calculus/registry");
    await screen.findByText("теория");
    expect(router.state.location.pathname).toBe("/calculus/theory");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
