import { expect, type Locator, type Page, test } from "@playwright/test";

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

test("an early stop waits for meta while the answer stream remains readable", async ({ page }) => {
  const mock = await mockChat(page, true, true);
  const stopped = Promise.withResolvers<Record<string, string>>();
  await page.route("**/v1/runs/r/stop", async (route) => {
    stopped.resolve(await route.request().allHeaders());
    await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  const input = await openChat(page);
  await input.fill("Объясни правило");
  await input.press("Enter");
  await mock.received;
  expect(mock.sent).toHaveLength(1);
  await page.getByRole("button", { name: "Остановить ответ" }).click();
  mock.sendMeta();
  const headers = await stopped.promise;
  expect(headers["x-browser-token"]).toBe("browser-e2e");
  expect(headers["x-session-token"]).toBe("session-e2e");
  const text = "Первые слова ответа";
  mock.send({ type: "delta", text });
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText("Ты остановил ответ")).toHaveCount(0);
  mock.send({
    type: "done",
    runId: "r",
    status: "stopped",
    text,
    steps: [],
    block: null,
    degraded: { active: false },
  });
  mock.end();
  await expect(page.getByText("Ты остановил ответ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить", exact: true })).toBeEnabled();
});

test("a refused stop leaves the answer streaming and allows a second click", async ({
  page,
}, info) => {
  const mock = await mockChat(page, true);
  let stopCount = 0;
  await page.route("**/v1/runs/r/stop", async (route) => {
    stopCount += 1;
    await route.fulfill({
      status: stopCount < 3 ? 503 : 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  const input = await openChat(page);
  await input.fill("Как найти корни квадратного уравнения?");
  await input.press("Enter");
  await expect(page.locator(".ai-title")).toHaveText("Новая тема");
  const initial = "Сначала вычислим дискриминант.";
  mock.send({ type: "delta", text: initial });
  await expect(page.getByText(initial)).toBeVisible();
  const stop = page.getByRole("button", { name: "Остановить ответ" });
  await stop.click();
  const warning = page.getByRole("status").filter({ hasText: "Не удалось остановить ответ" });
  await expect(warning).toBeVisible();
  expect(stopCount).toBe(2);
  const more = " Если он положителен, у уравнения два действительных корня.";
  mock.send({ type: "delta", text: more });
  await expect(page.getByText(initial + more, { exact: true })).toBeVisible();
  await expect(stop).toBeEnabled();
  await page.locator("#ai-panel").screenshot({ path: info.outputPath("stop-refused.png") });
  await stop.click();
  await expect(warning).toBeHidden();
  expect(stopCount).toBe(3);
  mock.send({
    type: "done",
    runId: "r",
    status: "stopped",
    text: initial + more,
    steps: [],
    block: null,
    degraded: { active: false },
  });
  mock.end();
  await expect(page.getByText("Ты остановил ответ")).toBeVisible();
});

test("retry after a gateway error before meta reuses the original request ID", async ({ page }) => {
  const mock = await mockChat(page, true);
  let unconfirmedId: unknown;
  await page.route(
    "**/v1/messages",
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      unconfirmedId = payload["clientRequestId"];
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "<h1>Bad gateway</h1>",
      });
    },
    { times: 1 },
  );
  const input = await openChat(page);
  await input.fill("Объясни правило.");
  await input.press("Enter");
  await expect(
    page.getByText("Соединение прервано до подтверждения. Можно повторить запрос."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await mock.received;
  expect(typeof unconfirmedId).toBe("string");
  expect(mock.sent[0]?.["clientRequestId"]).toBe(unconfirmedId);
  mock.complete();
  await expect(page.getByText("Готовый ответ на вопрос.")).toBeVisible();
  await expect(page.locator(".ai-user")).toHaveCount(1);
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

test("an incompatible first frame shows a readable error and keeps the chat usable", async ({
  page,
}) => {
  await mockChat(page, true);
  await page.route("**/v1/messages", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: `${JSON.stringify({
        type: "meta",
        threadId: "t",
        runId: "r",
        assistantMessageId: "a",
        userMessageId: "u",
        threadTitle: "Вопрос",
      })}\n`,
    }),
  );
  const input = await openChat(page);
  await input.fill("Почему?");
  await input.press("Enter");
  await expect(
    page.getByText("Не удалось прочитать ответ сервера. Попробуй еще раз."),
  ).toBeVisible();
  await expect(input).toBeEditable();
});

test("mobile header keeps Chat text and collapses search first", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByPlaceholder("Поиск", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Чат с ИИ")).toContainText("Чат");
  await page.setViewportSize({ width: 320, height: 844 });
  // folded, the field is `sr-only` (still focusable for the keyboard on a tap): a 1 px clip box
  expect(
    (await page.getByPlaceholder("Поиск", { exact: true }).evaluate((field) => {
      const box = field.closest("label")?.parentElement?.getBoundingClientRect();
      return box === undefined ? -1 : box.width;
    })) <= 1,
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Поиск", exact: true })).toBeVisible();
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

const mockTwoLectures = async (page: Page) => {
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
      body: '<section id="section"><h2>Раздел</h2><p style="text-align:right">Правый край</p><a href="#section">Следующая ссылка</a></section>',
    }),
  );
  return mock;
};

test("a citation opens the other lecture on mobile and contents stay reachable on a laptop", async ({
  page,
}) => {
  const mock = await mockTwoLectures(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/algebra/01_test");
  await expect(page.locator("[data-page] h1")).toBeVisible();
  const edge = page.locator("#section p");
  await edge.scrollIntoViewIfNeeded();
  await edge.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    globalThis.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const quote = page.getByRole("button", { name: "Спросить в чате о выделенном фрагменте" });
  await expect(quote).toBeVisible();
  const bounds = await quote.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(312);
  await quote.click();
  await expect(page.getByRole("textbox", { name: "Сообщение в чат" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(edge).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Следующая ссылка" })).toBeFocused();

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
  mock.complete(
    undefined,
    `[Открыть раздел](/algebra/02_test#section)

${"Остальная часть ответа.\n\n".repeat(40)}`,
  );
  const followUp = "Уточнение к первой лекции";
  await input.fill(followUp);
  await page.getByRole("link", { name: "Открыть раздел" }).click();
  await expect(page).toHaveURL(/02_test#section$/u);
  await expect(page.getByTitle("Чат с ИИ")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "К чату" }).click();
  await expect(input).toBeVisible();
  await expect(page.locator(".ai-title")).toHaveText("Новая тема");
  await expect(page.getByRole("link", { name: "Открыть раздел" })).toBeInViewport();
  await expect(input).toHaveValue(followUp);
  await input.press("Enter");
  await expect
    .poll(() => mock.sent.at(-1))
    .toMatchObject({
      docId: "01_test",
      threadId: "t",
      text: followUp,
    });
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
    const storage = element.ownerDocument.defaultView?.localStorage;
    const auth = JSON.parse(storage?.getItem("hse_chat_auth") ?? "{}") as Record<string, unknown>;
    storage?.setItem("hse_chat_auth", JSON.stringify({ ...auth, allowanceToken: null }));
  });
  await input.fill("Проверка");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Подтверди, что ты не бот" });
  await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(input).toBeFocused();
});

for (const path of ["/calculus", "/"]) {
  test(`mobile ${path} loads the reader and chat code only when needed`, async ({ page }) => {
    const requested = new Set<string>();
    page.on("request", (request) => {
      requested.add(new URL(request.url()).pathname);
    });
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("[data-page] h1")).toBeVisible();
    await page.clock.runFor(2000);
    expect(
      [...requested].filter(
        (path) =>
          path.includes("/features/lecture/page.tsx") ||
          path.includes("/shared/chat/runtime.tsx") ||
          path.includes("/shared/reader/tex-math.tsx"),
      ),
    ).toEqual([]);
  });
}

test("guest login waits for the SDK, then opens Telegram from the first enabled click", async ({
  page,
}) => {
  const sdk = Promise.withResolvers<boolean>();
  await page.route("https://oauth.telegram.org/**", async (route) => {
    await sdk.promise;
    await route.fulfill({
      contentType: "application/javascript",
      body: 'window.Telegram={Login:{auth:()=>{document.body.dataset.telegramActivation=String(navigator.userActivation.isActive); window.open("about:blank", "_blank");}}};',
    });
  });
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={render:()=> 'pending',reset:()=>{}};",
    }),
  );
  await openChat(page);
  const login = page.getByRole("button", { name: "Войти", exact: true });
  try {
    await expect(login).toBeDisabled({ timeout: 1000 });
  } finally {
    sdk.resolve(true);
  }
  const popup = page.waitForEvent("popup");
  await login.click();
  await (await popup).close();
  await expect(page.locator("body")).toHaveAttribute("data-telegram-activation", "true");
});

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("element has no box");
  }
  return box;
};

for (const width of [320, 390]) {
  test(`return buttons do not overlap on a ${String(width)} px phone and both work`, async ({
    page,
  }) => {
    const mock = await mockTwoLectures(page);
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/algebra/01_test");
    await page.getByTitle("Чат с ИИ").click();
    const input = page.getByRole("textbox", { name: "Сообщение в чат" });
    await input.fill("Вопрос");
    await input.press("Enter");
    await mock.received;
    mock.complete(undefined, "[Открыть раздел](/algebra/02_test#section)");
    const draft = "Черновик до перехода";
    await input.fill(draft);
    await page.getByRole("link", { name: "Открыть раздел" }).click();
    await expect(page).toHaveURL(/02_test#section$/u);
    const toChat = page.getByRole("button", { name: "К чату" });
    const back = page.getByRole("button", { name: /^Назад:/u });
    await expect(toChat).toBeVisible();
    await expect(back).toBeVisible();
    await expect(page.getByRole("button", { name: "Скрыть" })).toBeVisible();
    const chatBox = await boxOf(toChat);
    const backBox = await boxOf(back);
    for (const box of [
      chatBox,
      backBox,
      await boxOf(page.getByRole("button", { name: "Скрыть" })),
    ]) {
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
    }
    expect(chatBox.y + chatBox.height).toBeLessThanOrEqual(backBox.y);
    expect(backBox.x + backBox.width).toBeLessThanOrEqual(width);
    await expect(back).toContainText("лекция 1");

    await toChat.click();
    await expect(input).toHaveValue(draft);
    await expect(page.getByRole("link", { name: "Открыть раздел" })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("Чат с ИИ")).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /^Назад:/u }).click();
    await expect(page).toHaveURL(/01_test$/u);
  });
}

test("«Ничего не нашлось» offers the chat: a new thread with the query as an unsent draft", async ({
  page,
}) => {
  const mock = await mockChat(page);
  await page.goto("/");
  await expect(page.locator("[data-page]")).toBeVisible();
  await page.getByRole("combobox", { name: "Поиск по конспектам" }).fill("несуществующий термин");
  await expect(page.getByRole("status").filter({ hasText: "Ничего не нашлось" })).toBeVisible();
  await page.getByRole("button", { name: "Спросить в чате" }).click();
  const input = page.getByRole("textbox", { name: "Сообщение в чат" });
  await expect(input).toHaveValue("несуществующий термин");
  // the page's last thread («Почему так?») is not the one that opened
  await expect(page.locator(".ai-user")).toHaveCount(0);
  expect(mock.sent).toHaveLength(0);
});
