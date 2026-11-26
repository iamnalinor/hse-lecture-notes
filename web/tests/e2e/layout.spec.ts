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
