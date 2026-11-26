import type { QueryClient } from "@tanstack/react-query";

import { createBrowserRouter, type RouteObject } from "react-router";

import { catalogQuery, macrosQuery } from "#web/api/queries.ts";
import { PREP_IDS } from "#web/domain/preps.ts";

import { AppShell, ShellFallback } from "./app-shell.tsx";
import {
  LegacyGlossaryRedirect,
  LegacyPdfRedirect,
  LegacyTheoryRedirect,
} from "./legacy-redirect.tsx";
import { RouteError } from "./route-error.tsx";

type Page = () => Promise<{ readonly Component: React.ComponentType }>;

const PAGES = {
  course: async () => await import("#web/features/course/page.tsx"),
  home: async () => await import("#web/features/home/page.tsx"),
  lecture: async () => await import("#web/features/lecture/page.tsx"),
  prep: async () => await import("#web/features/prep/page.tsx"),
  program: async () => await import("#web/features/program/page.tsx"),
  theory: async () => await import("#web/features/theory/page.tsx"),
} satisfies Record<string, Page>;

const page = (path: string, load: Page): RouteObject => ({ lazy: async () => await load(), path });

/**
The catalog (every page) and the KaTeX macros (every formula) are in the cache before a page renders, so the page
never suspends on them. A Suspense fallback, once shown, stays for at least 300 ms in React 19 even if the data
comes a moment later: on the first load the «Курсы» section appeared that much after the slogan. Until this
resolves the router shows `HydrateFallback` (first load) or the skeleton (`isSwitching` in `AppShell`); with
the data cached it resolves at once.
*/
const loadSharedData = async (queryClient: QueryClient): Promise<null> => {
  const macros = async (): Promise<void> => {
    try {
      await queryClient.query(macrosQuery);
    } catch {
      // Not fatal here: a page without formulas opens; one with formulas reports the failure itself.
    }
  };
  await Promise.all([queryClient.query(catalogQuery), macros()]);
  return null;
};

export const appRoutes = (queryClient: QueryClient): RouteObject[] => [
  {
    loader: async () => await loadSharedData(queryClient),
    children: [
      { index: true, lazy: async () => await PAGES.home() },
      page(":course", PAGES.course),
      page(":course/theory", PAGES.theory),
      page(":course/program", PAGES.program),
      { Component: LegacyTheoryRedirect, path: ":course/registry" },
      { Component: LegacyPdfRedirect, path: "pdf/:file" },
      { Component: LegacyGlossaryRedirect, path: ":course/glossary" },
      ...PREP_IDS.map((id) => page(`:course/${id}`, PAGES.prep)),
      page(":course/:weekId", PAGES.lecture),
    ],
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: ShellFallback,
  },
];

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter(appRoutes(queryClient), { basename: import.meta.env.BASE_URL });
