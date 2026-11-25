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
  const reason = "Внутренняя ошибка сервера. Попробуй еще раз. Код: internal_error.";
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

test("one early click opens chat when the route and chat finish loading separately", async ({
  page,
}) => {
  const routeReady = Promise.withResolvers<boolean>();
  const chatReady = Promise.withResolvers<boolean>();
  await page.route("**/features/home/page.tsx*", async (route) => {
    await routeReady.promise;
    await route.continue();
  });
  await page.route("**/shared/chat/runtime.tsx*", async (route) => {
    await chatReady.promise;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  const button = page.getByTitle("Чат с ИИ");
  await button.click();
  try {
    routeReady.resolve(true);
    await expect(page.locator("[data-page]")).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  } finally {
    routeReady.resolve(true);
    chatReady.resolve(true);
  }
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeVisible();
});

test("mobile chat keeps keyboard focus inside and returns it to the header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockChat(page, true);
  const input = await openChat(page);
  await input.focus();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    await expect(page.locator("#ai-panel :focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTitle("Чат с ИИ")).toBeFocused();
});

test("a citation opens the other lecture on mobile and contents stay reachable on a laptop", async ({
  page,
}) => {
  const mock = await mockChat(page, true);
  const lectures = [1, 2].map((n) => ({
    date: "2026-09-03",
    lecture: n,
    title: `Тестовая лекция ${n}`,
    week_id: `0${n}_test`,
  }));
  await page.route("**/data/courses.json", (route) =>
    route.fulfill({ json: { lectures: { algebra: lectures } } }),
  );
  await page.route("**/data/algebra/*/meta.json", (route) =>
    route.fulfill({
      json: {
        date_ru: "3 сентября",
        lecture: 1,
        title: "Тестовая лекция",
        kind: "notes",
        toc: [{ id: "section", level: 1, text: "Раздел" }],
      },
    }),
  );
  await page.route("**/data/algebra/*/fragment.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<section id="section"><h2>Раздел</h2></section>',
    }),
  );
  await page.goto("/algebra/01_test");
  await expect(page.locator("[data-page] h1")).toBeVisible();
  await page.getByTitle("Чат с ИИ").click();
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("[data-toc-pill] button")).toBeVisible();
    await page.locator("[data-toc-pill] button").click();
    await expect(page.getByRole("dialog", { name: "Оглавление" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const input = page.getByRole("textbox", { name: "Сообщение в чат" });
  await input.fill("Следующая лекция");
  await input.press("Enter");
  await expect(page.locator(".ai-title")).toHaveText("Новая тема");
  mock.complete(undefined, "[Открыть раздел](/algebra/02_test#section)");
  await page.getByRole("link", { name: "Открыть раздел" }).click();
  await expect(page).toHaveURL(/02_test#section$/u);
  await expect(page.getByTitle("Чат с ИИ")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "К чату" }).click();
  await expect(input).toBeVisible();
});

test("interactive browser verification takes keyboard focus and restores it on Escape", async ({
  page,
}) => {
  await mockChat(page, true);
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={ready:f=>f(),render:(host,opts)=>{opts['before-interactive-callback']();return 'fake';},reset:()=>{},remove:()=>{}};",
    }),
  );
  const input = await openChat(page);
  await input.evaluate((element) => {
    element.ownerDocument.defaultView?.localStorage.removeItem("hse_chat_allowance_token");
  });
  await input.fill("Проверка");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Подтверди, что ты не бот" });
  await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(input).toBeFocused();
});
