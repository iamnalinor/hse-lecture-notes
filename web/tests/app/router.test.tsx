import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import type * as Introduction from "#web/features/home/introduction.tsx";

import { createQueryClient } from "#web/app/query-client.ts";
import { appRoutes } from "#web/app/router.tsx";

vi.mock("#web/shared/layout/top-bar.tsx", () => ({ TopBar: () => null }));
vi.mock("#web/shared/layout/site-footer.tsx", () => ({ SiteFooter: () => null }));
vi.mock("#web/shared/layout/back-bar.tsx", () => ({ BackBar: () => null }));
vi.mock("#web/shared/offline/update-banner.tsx", () => ({ UpdateBanner: () => null }));
vi.mock("#web/app/lazy-chat.tsx", () => ({ LazyChat: () => null }));
vi.mock("#web/features/home/introduction.tsx", async (importOriginal) => ({
  ...(await importOriginal<typeof Introduction>()),
  HomeStart: () => <p data-home-skeleton="" />,
}));

/** Data files by name; the study plan (`curriculum.json`) is optional and missing here. */
const DATA = new Map<string, unknown>([
  ["courses.json", { lectures: {}, preps: {}, programs: [] }],
  ["katex-macros.json", {}],
]);

/** Serves the data files from `DATA` (404 for the rest); `failing` answers 500. */
const stubData = (failing?: string) => {
  const respond = (url: string): Response => {
    const name = url.split("/").at(-1) ?? "";
    const data = DATA.get(name);
    if (name === failing) {
      return new Response("", { status: 500 });
    }
    return data === undefined ? new Response("", { status: 404 }) : Response.json(data);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => Promise.resolve(respond(url))),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/*
A Suspense fallback that has been shown stays on screen for at least 300 ms in React 19 (the fallback throttle),
even when the data arrives a moment later: on the entry page that was the «Курсы» section appearing late.
*/
it("opens the home page without a Suspense fallback: the shared data is loaded before the first render", async () => {
  stubData();
  const client = createQueryClient();
  const router = createMemoryRouter(appRoutes(client), { initialEntries: ["/"] });
  const skeletonsInContent: number[] = [];
  const observer = new MutationObserver(() => {
    skeletonsInContent.push(document.querySelectorAll("#content [data-home-skeleton]").length);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("heading", { name: "Курсы" })).toBeInTheDocument();
  observer.disconnect();
  expect(skeletonsInContent.every((count) => count === 0)).toBe(true);
});

it("shows the error page when the catalog cannot be loaded", async () => {
  stubData("courses.json");
  const client = createQueryClient();
  const router = createMemoryRouter(appRoutes(client), { initialEntries: ["/"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("Не получилось открыть страницу", {}, { timeout: 4000 }),
  ).toBeInTheDocument();
});
