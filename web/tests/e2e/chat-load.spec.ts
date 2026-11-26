import { expect, test } from "@playwright/test";

import { mockChat } from "./support/chat.ts";
import { mockSiteData } from "./support/site-data.ts";

const CHAT_CHUNK = "**/shared/chat/runtime.tsx*";
const FAILURE = "Не удалось загрузить чат";

test.beforeEach(async ({ page }) => {
  await mockSiteData(page);
  await mockChat(page);
  await page.goto("/");
  await expect(page.locator("[data-page]")).toBeVisible();
});

test("the panel opens at once as a skeleton and the chat replaces it in place", async ({
  page,
}) => {
  const held = Promise.withResolvers<undefined>();
  await page.route(CHAT_CHUNK, async (route) => {
    await held.promise;
    await route.continue();
  });
  await page.getByTitle("Чат с ИИ").click();
  const shell = page.getByRole("complementary", { name: "Чат с ИИ" });
  await expect(shell).toHaveAttribute("aria-busy", "true");
  await expect(shell.getByText("Загружаю чат")).toBeAttached();
  // The shell slides in: measure it once it has settled.
  await shell.evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)));
  const shellBox = await shell.boundingBox();
  held.resolve(undefined);
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
  const panelBox = await page.getByRole("complementary", { name: "Чат с ИИ" }).boundingBox();
  expect(panelBox).toEqual(shellBox);
});

test("a chat chunk that is blocked shows a centered failure, and the retry opens the chat", async ({
  page,
}) => {
  await page.route(CHAT_CHUNK, async (route) => {
    await route.abort();
  });
  await page.getByTitle("Чат с ИИ").click();
  const failure = page.getByRole("alert");
  await expect(failure).toContainText(FAILURE);
  await expect(failure).toContainText("Проверь подключение и попробуй еще раз");
  await page.unroute(CHAT_CHUNK);
  await failure.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
  await expect(page.getByText(FAILURE)).toBeHidden();
});

test("closing the failed shell takes the wish to open back", async ({ context, page }) => {
  await page.route(CHAT_CHUNK, async (route) => {
    await route.abort();
  });
  const toggle = page.getByTitle("Чат с ИИ");
  await toggle.click();
  await expect(page.getByText(FAILURE)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(FAILURE)).toBeHidden();
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
  await expect(page.getByText("Нет сети. Чат откроется, когда связь вернется")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
  await expect(page.getByText(FAILURE)).toBeHidden();
});
