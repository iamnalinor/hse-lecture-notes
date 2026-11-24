import { expect, test } from "@playwright/test";

import { mockChat, suggestion } from "./support/chat.ts";
import { mockSiteData } from "./support/site-data.ts";

test.beforeEach(async ({ page }) => {
  await mockSiteData(page);
});

const openChat = async (page: Parameters<typeof mockChat>[0]) => {
  await page.goto("/");
  await expect(page.locator("[data-page]")).toBeVisible();
  await page.getByTitle("Чат с ИИ").click();
  const input = page.getByRole("textbox", { name: "Сообщение в чат" });
  await expect(input).toBeVisible();
  return input;
};

test("suggestion fits on mobile and Tab accepts it without sending", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await mockChat(page);
  const input = await openChat(page);
  await expect(input).toHaveAttribute("placeholder", suggestion);
  expect(await input.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await input.focus();
  await input.press("Tab");
  await expect(input).toHaveValue(suggestion);
  expect(mock.sent).toHaveLength(0);
  await input.fill("");
  await expect(input).not.toHaveAttribute("placeholder", suggestion);
});

test("history closes outside and with Escape while chat stays open", async ({ page }) => {
  await mockChat(page);
  const input = await openChat(page);
  const trigger = page.getByRole("button", { name: "История чатов" });
  const menu = page.getByRole("group", { name: "История чатов" });
  await trigger.click();
  await expect(menu).toBeVisible();
  await input.click();
  await expect(menu).toBeHidden();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(input).toBeVisible();
});

test("topic arrives before the answer and one submitted question stays in history", async ({
  page,
}) => {
  const mock = await mockChat(page, true);
  const input = await openChat(page);
  await input.fill("Объясни правило");
  await input.press("Enter");
  await expect(page.locator(".ai-title")).toHaveText("Новая тема");
  await expect(page.getByText("Готовый ответ на вопрос.")).toHaveCount(0);
  mock.complete();
  await expect(page.getByText("Готовый ответ на вопрос.")).toBeVisible();
  await expect(page.locator(".ai-user")).toHaveCount(1);
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", suggestion);
  expect(mock.sent).toHaveLength(1);
});

test("server errors show their reason instead of an invented timeout", async ({ page }) => {
  const mock = await mockChat(page, true);
  const input = await openChat(page);
  await input.fill("Вопрос");
  await input.press("Enter");
  await expect(page.locator(".ai-title")).toHaveText("Новая тема");
  const reason = "Внутренняя ошибка сервера. Попробуйте ещё раз. Код: internal_error.";
  mock.complete(reason);
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить", exact: true })).toBeEnabled();
  await expect(page.getByText("Сервер не ответил вовремя.", { exact: false })).toHaveCount(0);
});

test("mobile header keeps Chat text and collapses search first", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByPlaceholder("Поиск", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Чат с ИИ")).toContainText("Чат");
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByPlaceholder("Поиск", { exact: true })).toBeHidden();
  await expect(page.getByTitle("Чат с ИИ")).toContainText("Чат");
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
});
