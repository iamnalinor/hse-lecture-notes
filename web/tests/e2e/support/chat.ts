import type { Page } from "@playwright/test";

import { mockMessageStream } from "./chat-stream.ts";

export const suggestion = "Какие правила блокирующего экзамена по алгебре?";
const now = Date.now();
const user = {
  id: "u",
  seq: 1,
  role: "user",
  status: "done",
  page: { course: "", docId: "" },
  contentTex: "Почему так?",
  quote: null,
  steps: [],
  runId: "r",
  createdAt: now,
  updatedAt: now,
  errorMessage: null,
};
const answer = {
  ...user,
  id: "a",
  seq: 2,
  role: "assistant",
  contentTex: "Производная квадрата равна удвоенному аргументу.",
  suggestion,
};
const thread = {
  id: "t",
  title: "Производная",
  generatedTitle: "Производная",
  messages: [user, answer],
  createdAt: now,
  updatedAt: now,
};

/** Real browser/UI and HTTP streaming; external authentication/model services are deterministic fixtures. */
export const mockChat = async (page: Page, isEmptyThread = false, shouldHoldMeta = false) => {
  await page.route("https://challenges.cloudflare.com/**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={ready:f=>f(),render:()=> 'e2e',execute:()=>{},reset:()=>{},remove:()=>{}};",
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "hse_chat_auth",
      JSON.stringify({
        browserToken: "browser-e2e",
        sessionToken: "session-e2e",
        tier: "default",
        user: { id: 1, name: "Albert" },
        allowanceToken: "allowance-e2e",
        allowanceExpiresAt: Date.now() + 3_600_000,
      }),
    );
    localStorage.setItem("hse_chat_thread:1", "t");
  });
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const isThread = route.request().url().includes("/v1/thread");
    const json = isThread
      ? {
          thread: isEmptyThread ? null : thread,
          threads: isEmptyThread ? [] : [thread],
          hasMore: false,
          requestedThreadMissing: false,
        }
      : {
          allowanceExpiresAt: Date.now() + 3_600_000,
          allowanceToken: "allowance-e2e",
          browserToken: "browser-e2e",
          tier: "default",
          user: { id: 1, name: "Albert" },
          block: null,
          degraded: { active: false },
        };
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      json,
    });
  });
  const stream = await mockMessageStream(page, shouldHoldMeta);
  return {
    ...stream,
    complete: (errorMessage?: string, answerText = "Готовый ответ на вопрос.") => {
      const isError = errorMessage !== undefined;
      const text = isError ? "" : answerText;
      if (text !== "") {
        stream.send({ type: "delta", text });
      }
      stream.send({
        type: "done",
        runId: "r",
        status: isError ? "error" : "done",
        text,
        errorMessage: errorMessage ?? null,
        steps: [],
        block: null,
        degraded: { active: false },
        suggestion: isError ? null : suggestion,
      });
      stream.end();
    },
  };
};
