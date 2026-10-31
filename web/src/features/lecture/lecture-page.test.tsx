import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  catalogQuery,
  docMetaQuery,
  fragmentQuery,
  labelIndexQuery,
  macrosQuery,
} from "#web/api/queries.ts";

import { Component } from "./lecture-page.tsx";

const WEEK_ID = "03_sep16_permutations_determinant";

const open = (entry: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(catalogQuery.queryKey, {
    lectures: {
      algebra: [{ date: "2026-09-16", lecture: 3, title: "Перестановки", weekId: WEEK_ID }],
    },
    preps: {},
    programs: [],
  });
  client.setQueryData(docMetaQuery("algebra", WEEK_ID).queryKey, {
    date: "2026-09-16",
    dateRu: "16 сентября 2026",
    kind: "notes",
    lecture: 3,
    title: "Перестановки",
    toc: [{ id: "sec:lec03:theory", level: 1, text: "Теория" }],
  });
  client.setQueryData(
    fragmentQuery("algebra", WEEK_ID).queryKey,
    '<section id="sec:lec03:theory"><h1>Теория</h1><p>Текст лекции</p></section>',
  );
  client.setQueryData(labelIndexQuery.queryKey, {});
  client.setQueryData(macrosQuery.queryKey, {});
  const router = createMemoryRouter(
    [
      {
        Component,
        ErrorBoundary: () => <p>нет страницы</p>,
        path: ":course/:weekId",
      },
    ],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

describe("lecture page addresses", () => {
  beforeEach(() => {
    // jsdom has no media queries; the page asks one to pick its table of contents.
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: () => undefined,
      matches: true,
      removeEventListener: () => undefined,
    }));
  });

  it("moves a link with an outdated slug to the lecture with the same number", async () => {
    const router = open("/algebra/03_sep16_permutations?x=1#thm:lec03:sign");
    expect(await screen.findByText("Текст лекции")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/algebra/${WEEK_ID}`);
    expect(router.state.location.hash).toBe("#thm:lec03:sign");
    expect(router.state.location.search).toBe("?x=1");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("answers 404 for a lecture number the course does not have", async () => {
    open("/algebra/07_oct14_matrix_rank");
    expect(await screen.findByText("нет страницы")).toBeInTheDocument();
  });
});
