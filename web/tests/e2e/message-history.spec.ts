import { expect, test } from "@playwright/test";

import { mockChat } from "./support/chat.ts";
import { mockSiteData } from "./support/site-data.ts";

test("older messages load in place without moving the reader away from the previous page", async ({
  page,
}) => {
  await mockSiteData(page);
  await mockChat(page);
  await page.route("**/v1/thread?**", async (route) => {
    const isEarlier = new URL(route.request().url()).searchParams.get("beforeSeq") === "5";
    const messages = Array.from({ length: isEarlier ? 4 : 50 }, (_, index) => {
      const seq = index + (isEarlier ? 1 : 5);
      return {
        seq,
        id: String(seq),
        role: "user",
        status: "done",
        page: { course: "", docId: "" },
        contentTex: `Сообщение из истории ${seq}`,
        quote: null,
        steps: [],
        runId: null,
        createdAt: seq,
        updatedAt: seq,
        errorMessage: null,
      };
    });
    const thread = {
      id: "t",
      title: "История",
      generatedTitle: null,
      beforeSeq: isEarlier ? null : 5,
      messages,
      createdAt: 1,
      updatedAt: 54,
    };
    await route.fulfill({
      json: { thread, threads: [thread], hasMore: false, requestedThreadMissing: false },
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
    });
  });
  await page.goto("/");
  await page.getByTitle("Чат с ИИ").click();
  const more = page.getByRole("button", { name: "Показать предыдущие сообщения" });
  await expect(more).toBeAttached();
  await page.keyboard.press("Escape");
  await page.getByTitle("Чат с ИИ").click();
  await more.scrollIntoViewIfNeeded();
  const anchor = page.getByText("Сообщение из истории 5", { exact: true });
  const before = await anchor.boundingBox();
  await more.click();
  await expect(page.getByText("Сообщение из истории 1", { exact: true })).toHaveCount(1);
  await expect(more).toHaveCount(0);
  await expect
    .poll(async () => Math.abs(((await anchor.boundingBox())?.y ?? 0) - (before?.y ?? 0)))
    .toBeLessThan(4);
});
