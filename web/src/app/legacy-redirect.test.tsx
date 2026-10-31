import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogQuery } from "#web/api/queries.ts";

import { LegacyPdfRedirect, LegacyTheoryRedirect } from "./legacy-redirect.tsx";

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

const openPdf = (entry: string) => {
  const client = new QueryClient();
  client.setQueryData(catalogQuery.queryKey, {
    lectures: {
      algebra: [
        {
          date: "2026-09-16",
          lecture: 3,
          title: "Перестановки",
          weekId: "03_sep16_permutations_determinant",
        },
      ],
    },
    preps: {},
    programs: [],
  });
  const router = createMemoryRouter(
    [
      {
        Component: LegacyPdfRedirect,
        ErrorBoundary: () => <p>нет файла</p>,
        path: "pdf/:file",
      },
    ],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe("LegacyPdfRedirect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an old lecture PDF link to the file of the lecture with the same number", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { replace });
    openPdf("/pdf/algebra-03_sep16_permutations.pdf");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/pdf/algebra-03_sep16_permutations_determinant.pdf");
    });
  });

  it("answers 404 when the file is missing under its current name or matches no lecture", async () => {
    openPdf("/pdf/algebra-03_sep16_permutations_determinant.pdf");
    expect(await screen.findByText("нет файла")).toBeInTheDocument();
  });

  it("answers 404 for PDFs that are not lectures", async () => {
    openPdf("/pdf/algebra-theory.pdf");
    expect(await screen.findByText("нет файла")).toBeInTheDocument();
  });
});
