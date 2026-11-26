import { expect, type Page, test } from "@playwright/test";

import { mockSiteData } from "./support/site-data.ts";

const WIDTHS = [320, 360, 390, 640, 768, 1024, 1280] as const;

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) {
    throw new Error(`${selector} is not visible`);
  }
  return found;
};

for (const width of WIDTHS) {
  test.describe(`${String(width)} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ height: 900, width });
      await mockSiteData(page);
      await page.goto("/");
      await expect(page.locator("[data-page]")).toBeVisible();
    });

    test("the logo is as tall as the header buttons beside it", async ({ page }) => {
      const logo = await box(page, "[data-site-header] [data-logo-mark]");
      const theme = await page.locator("[data-site-header] button").last().boundingBox();
      if (theme === null) {
        throw new Error("theme toggle is not visible");
      }
      expect(Math.round(logo.height)).toBe(Math.round(theme.height));
      expect(Math.round(logo.width)).toBe(Math.round(logo.height));
      expect(Math.abs(logo.y + logo.height / 2 - (theme.y + theme.height / 2))).toBeLessThan(1);
    });

    test("the rule under the hero sits midway between the text above and the heading below", async ({
      page,
    }) => {
      // The rule is the top border of the courses section; the text above it is the visible hero paragraph or counters.
      const gaps = await page.locator("#courses").evaluate((courses) => {
        const document = courses.ownerDocument;
        const inkBox = (element: Element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rects = [...range.getClientRects()];
          return {
            bottom: Math.max(...rects.map((rect) => rect.bottom)),
            top: Math.min(...rects.map((rect) => rect.top)),
          };
        };
        const above = [...(courses.previousElementSibling?.querySelectorAll("p, dl") ?? [])].filter(
          (element) => element.getClientRects().length > 0,
        );
        const heading = courses.querySelector("h2");
        if (heading === null || above.length === 0) {
          throw new Error("hero text or heading missing");
        }
        const rule = courses.getBoundingClientRect().top;
        return {
          above: rule - Math.max(...above.map((element) => inkBox(element).bottom)),
          below: inkBox(heading).top - rule,
        };
      });
      expect(Math.abs(gaps.above - gaps.below)).toBeLessThanOrEqual(8);
    });
  });
}

test("the header search at 390 px shows the start of a long query", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await mockSiteData(page);
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Поиск по конспектам" });
  await field.fill("определитель");
  const state = await field.evaluate((input) => ({
    clientWidth: input.clientWidth,
    scrollLeft: input.scrollLeft,
    scrollWidth: input.scrollWidth,
  }));
  expect(state.scrollLeft).toBe(0);
  expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth);
});

for (const width of [320, 390, 768, 1280]) {
  test(`${String(width)} px: the home slogan reserves its height, nothing moves when the other layers mount`, async ({
    page,
  }) => {
    type SloganSnapshot = {
      readonly layers: number;
      readonly heading: number;
      readonly below: number;
    };
    await page.setViewportSize({ height: 900, width });
    await mockSiteData(page);
    // Every change of the h1 is measured right where it happens (forced layout in the observer).
    await page.addInitScript(() => {
      const snapshots: SloganSnapshot[] = [];
      Object.assign(globalThis, { sloganSnapshots: snapshots });
      new MutationObserver(() => {
        const heading = document.querySelector("h1");
        const below = heading?.parentElement?.nextElementSibling;
        if (heading === null || below === null || below === undefined) {
          return;
        }
        const layers = heading.querySelectorAll(".slogan-layer").length;
        if (snapshots.at(-1)?.layers !== layers) {
          snapshots.push({
            below: below.getBoundingClientRect().top,
            heading: heading.getBoundingClientRect().height,
            layers,
          });
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await expect(page.locator("h1 .slogan-layer")).toHaveCount(15);
    const snapshots = await page.evaluate(
      () => (globalThis as unknown as { sloganSnapshots: SloganSnapshot[] }).sloganSnapshots,
    );
    // the first render has the default slogan alone, then all of them
    expect(snapshots.map((snapshot) => snapshot.layers)).toEqual([1, 15]);
    expect(snapshots[1]?.heading).toBe(snapshots[0]?.heading);
    expect(snapshots[1]?.below).toBe(snapshots[0]?.below);
  });
}
