import { createBrowserRouter, type RouteObject } from "react-router";

import { PREP_IDS } from "#web/domain/preps.ts";

import { AppShell, ShellFallback } from "./app-shell.tsx";
import { LegacyTheoryRedirect } from "./legacy-redirect.tsx";
import { RouteError } from "./route-error.tsx";

type Page = () => Promise<{ readonly Component: React.ComponentType }>;

const PAGES = {
  course: async () => await import("#web/features/course/course-page.tsx"),
  glossary: async () => await import("#web/features/glossary/glossary-page.tsx"),
  home: async () => await import("#web/features/home/home-page.tsx"),
  lecture: async () => await import("#web/features/lecture/lecture-page.tsx"),
  prep: async () => await import("#web/features/prep/prep-page.tsx"),
  program: async () => await import("#web/features/program/program-page.tsx"),
  theory: async () => await import("#web/features/theory/theory-page.tsx"),
} satisfies Record<string, Page>;

const page = (path: string, load: Page): RouteObject => ({ lazy: async () => await load(), path });

const routes: RouteObject[] = [
  {
    children: [
      { index: true, lazy: async () => await PAGES.home() },
      page(":course", PAGES.course),
      page(":course/theory", PAGES.theory),
      page(":course/program", PAGES.program),
      { Component: LegacyTheoryRedirect, path: ":course/registry" },
      page(":course/glossary", PAGES.glossary),
      ...PREP_IDS.map((id) => page(`:course/${id}`, PAGES.prep)),
      page(":course/:weekId", PAGES.lecture),
    ],
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: ShellFallback,
  },
];

export const createAppRouter = () =>
  createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

/** Page code is small: fetch all of it once the first page is up, so clicks never wait for it. */
export const preloadPages = async (): Promise<void> => {
  await Promise.allSettled(Object.values(PAGES).map(async (load) => await load()));
};
