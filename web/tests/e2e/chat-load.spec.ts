import { expect, test } from "@playwright/test";

import { mockChat } from "./support/chat.ts";
import { mockSiteData } from "./support/site-data.ts";

const CHAT_CHUNK = "**/shared/chat/runtime.tsx*";

test.beforeEach(async ({ page }) => {
  await mockSiteData(page);
  await mockChat(page);
  await page.goto("/");
  await expect(page.locator("[data-page]")).toBeVisible();
});

test("a chat chunk that is blocked offers a retry, and the retry opens the chat", async ({
  page,
}) => {
  await page.route(CHAT_CHUNK, async (route) => {
    await route.abort();
  });
  const toggle = page.getByTitle("Чат с ИИ");
  await toggle.click();
  const popover = page.locator("[data-popover]");
  await expect(popover).toContainText("Чат не загрузился: нет связи.");
  await expect(toggle).not.toHaveAttribute("aria-busy");
  await page.unroute(CHAT_CHUNK);
  await popover.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
  await expect(popover).toBeHidden();
});

test("closing the failure popover takes the wish to open back", async ({ context, page }) => {
  await page.route(CHAT_CHUNK, async (route) => {
    await route.abort();
  });
  const toggle = page.getByTitle("Чат с ИИ");
  await toggle.click();
  const popover = page.locator("[data-popover]");
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(toggle).toBeFocused();
  await page.unroute(CHAT_CHUNK);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeHidden();
});

test("the chat opens by itself when the network comes back", async ({ context, page }) => {
  await context.setOffline(true);
  await page.getByTitle("Чат с ИИ").click();
  await expect(page.locator("[data-popover]")).toContainText(
    "Нет сети — открою чат, когда связь вернётся.",
  );
  await context.setOffline(false);
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
  await expect(page.locator("[data-popover]")).toBeHidden();
});
