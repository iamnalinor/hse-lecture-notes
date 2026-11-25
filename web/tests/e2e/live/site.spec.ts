import { expect, type Page, test } from "@playwright/test";

// This suite never mocks content, HTTP or WebSocket responses. Run against a built
// preview or deployment with `bun run test:e2e:live`. Chat uses short-lived tokens
// for a dedicated smoke-test identity supplied by the operator, never real users.

const observeTransition = async (page: Page): Promise<readonly number[]> =>
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      globalThis.document.addEventListener(
        "click",
        () => {
          resolve();
        },
        { once: true, capture: true },
      );
    });
    for (let frame = 0; frame < 30; frame++) {
      await new Promise<void>((resolve) => {
        globalThis.requestAnimationFrame(() => {
          resolve();
        });
      });
      const durations = globalThis.document
        .getAnimations()
        .map((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          return effect !== null && effect.pseudoElement?.includes("view-transition") === true
            ? effect.getTiming().duration
            : null;
        })
        .filter((duration): duration is number => typeof duration === "number");
      if (durations.length > 0) {
        return durations;
      }
    }
    return [];
  });

test("home → course → notes, search → a real result, quiz solutions and PDF", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/");
  await expect(page.locator("[data-page]")).toBeVisible();
  const course = page.locator('main a[href="/calculus"]').first();
  await course.click();
  await expect(page).toHaveURL(/\/calculus\/?$/u);
  const note = page.locator('main a[href*="/calculus/"]').filter({ hasText: /лекци/iu }).first();
  await note.click();
  await expect(page.locator(".prose-notes")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
  const search = page.getByRole("combobox", { name: "Поиск по конспектам" });
  await search.fill("производная");
  const result = page.getByRole("option").first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page.locator(".prose-notes")).toBeVisible();
  await page.goto("/calculus/quiz-o-symbols");
  const problem = page.locator('[id="prob:quiz-o-symbols:powers-points"]');
  await expect(problem).toBeVisible();
  const parts = problem.locator("ul").first().locator(":scope > li");
  await expect(parts).toHaveCount(4);
  const positions = await parts.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(positions.every((top, i) => i === 0 || top > (positions[i - 1] ?? 0))).toBe(true);
  const solution = problem.getByText("Показать решение", { exact: true });
  await solution.click();
  const opened = problem.getByRole("button", { name: "Решение", exact: true });
  await expect(opened).toHaveAttribute("aria-expanded", "true");
  const panelId = await opened.getAttribute("aria-controls");
  const solutionPanel = page.locator(`[id="${panelId ?? "missing"}"]`);
  await expect(solutionPanel).toBeVisible();
  expect((await solutionPanel.innerText()).length).toBeGreaterThan(20);
  await problem.getByRole("button", { name: "Решение", exact: true }).click();
  await expect(solution).toHaveAttribute("aria-expanded", "false");
  await expect(solutionPanel).toBeHidden();
  const pdf = page.locator('a[href$=".pdf"]').first();
  const pdfUrl = await pdf.getAttribute("href");
  expect(pdfUrl).toBeTruthy();
  const response = await request.get(pdfUrl ?? "");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("pdf");
  expect(errors).toEqual([]);
});

test("light/dark themes persist, animate and respect reduced motion", async ({ page }, info) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("theme") === null) {
      localStorage.setItem("theme", "light");
    }
  });
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  const animated = observeTransition(page);
  await page.getByRole("button", { name: "Тёмная тема", exact: true }).first().click();
  expect(await animated).toContain(280);
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Светлая тема", exact: true }).first(),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("theme-dark.png") });
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = observeTransition(page);
  await page.getByRole("button", { name: "Светлая тема", exact: true }).first().click();
  expect(await reduced).toEqual([]);
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Тёмная тема", exact: true }).first(),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("theme-light.png") });
});

test("real chat returns a usable suggestion, Tab fills it and history survives reload", async ({
  page,
}, info) => {
  test.setTimeout(110_000);
  expect(
    info.project.use.storageState,
    "Supply a temporary Playwright storage state through E2E_STORAGE_STATE_DESKTOP / E2E_STORAGE_STATE_MOBILE",
  ).toBeDefined();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/");
  const frames: Record<string, unknown>[] = [];
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      frames.push(JSON.parse(String(payload)) as Record<string, unknown>);
    }),
  );
  await page.getByTitle("Чат с ИИ").click();
  const input = page.getByRole("textbox", { name: "Сообщение в чат" });
  await input.fill("Что важнее перед КР: выучить доказательства или решить больше задач?");
  await page.context().setOffline(true);
  await input.press("Enter");
  const retry = page.getByRole("button", { name: "Повторить", exact: true });
  await expect(retry).toBeVisible();
  await page.context().setOffline(false);
  await retry.click();
  await expect
    .poll(() => frames.find((frame) => frame["type"] === "done" || frame["type"] === "error"), {
      timeout: 75_000,
    })
    .toBeTruthy();
  const done = frames.find((frame) => frame["type"] === "done");
  expect(done, JSON.stringify(frames.filter((frame) => frame["type"] === "error"))).toBeDefined();
  expect(done?.["status"]).toBe("done");
  const suggestion = done?.["suggestion"];
  expect(
    typeof suggestion,
    "This smoke case must demonstrate a real suggestion, not silently skip its absence",
  ).toBe("string");
  if (typeof suggestion !== "string") {
    return;
  }
  await expect(page.locator(".ai-user")).toHaveCount(1);
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", suggestion);
  expect(await input.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
  const historyButton = page.getByRole("button", { name: "История чатов" });
  const menu = page.getByRole("group", { name: "История чатов" });
  await historyButton.click();
  await expect(menu).toBeVisible();
  await input.click();
  await expect(menu).toBeHidden();
  await historyButton.click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(input).toBeVisible();
  await page.reload();
  await page.getByTitle("Чат с ИИ").click();
  await expect(page.locator(".ai-user")).toHaveCount(1);
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await expect(input).toHaveAttribute("placeholder", suggestion);
  await input.focus();
  await input.press("Tab");
  await expect(input).toHaveValue(suggestion);
  await expect(page.locator(".ai-user")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("chat-suggestion.png") });
  await input.fill("");
  await expect(input).not.toHaveAttribute("placeholder", suggestion);
  await page.getByRole("button", { name: "Новый чат", exact: true }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(0);
  await historyButton.click();
  await menu.getByRole("button").first().click();
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  expect(errors).toEqual([]);
  await info.attach("chat-result", {
    body: JSON.stringify({ runId: done?.["runId"], suggestion, project: info.project.name }),
    contentType: "application/json",
  });
});
