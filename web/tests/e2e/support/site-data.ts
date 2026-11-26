import type { Page } from "@playwright/test";

const files: Readonly<Record<string, unknown>> = {
  "/data/courses.json": {
    lectures: { algebra: [], calculus: [], discrete: [], aiya: [] },
    preps: {},
    programs: [],
  },
  "/data/index.json": {},
  "/data/katex-macros.json": {},
  "/data/search.json": [],
  "/data/curriculum.json": {
    title: "Учебный план",
    categories: [],
    disciplines: [],
    module_spans: [],
  },
};

/** Every content request is intercepted: E2E never depends on locally generated notes. */
export const mockSiteData = async (page: Page): Promise<void> => {
  await page.route("**/data/**", async (route) => {
    const data = files[new URL(route.request().url()).pathname];
    if (data === undefined) {
      await route.fulfill({ status: 404, body: "Missing E2E content fixture" });
      return;
    }
    await route.fulfill({ status: 200, json: data });
  });
};
