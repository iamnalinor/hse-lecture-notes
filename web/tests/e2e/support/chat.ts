import type { Page, WebSocketRoute } from "@playwright/test";

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

/** Real browser/UI and HTTP/WS contracts; external authentication/model services are deterministic fixtures. */
export const mockChat = async (page: Page, isEmptyThread = false) => {
  await page.route("https://challenges.cloudflare.com/**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={ready:f=>f(),render:()=> 'e2e',execute:()=>{},reset:()=>{},remove:()=>{}};",
    });
  });
  const sent: Record<string, unknown>[] = [];
  let socket: undefined | WebSocketRoute;
  await page.addInitScript(() => {
    localStorage.setItem("hse_chat_browser_token", "browser-e2e");
    localStorage.setItem("hse_chat_session_token", "session-e2e");
    localStorage.setItem("hse_chat_tier", "default");
    localStorage.setItem("hse_chat_user", JSON.stringify({ id: 1, name: "Albert" }));
    localStorage.setItem("hse_chat_allowance_token", "allowance-e2e");
    localStorage.setItem("hse_chat_allowance_exp", String(Date.now() + 3_600_000));
    localStorage.setItem("hse_chat_thread:1:/", "t");
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
  await page.routeWebSocket("ws://127.0.0.1:8787/v1/messages", (route) => {
    socket = route;
    route.onMessage((message) => {
      const request = JSON.parse(String(message)) as Record<string, unknown>;
      sent.push(request);
      route.send(
        JSON.stringify({
          type: "meta",
          threadId: "t",
          runId: "r",
          assistantMessageId: "a",
          userMessageId: "u",
          threadTitle: "Вопрос",
          generatedTitle: null,
          degraded: { active: false },
        }),
      );
      route.send(JSON.stringify({ type: "title", threadId: "t", title: "Новая тема" }));
    });
  });
  return {
    sent,
    complete: (errorMessage?: string) => {
      if (socket === undefined) {
        throw new Error("No message request received");
      }
      const isError = errorMessage !== undefined;
      const text = isError ? "" : "Готовый ответ на вопрос.";
      if (text !== "") {
        socket.send(JSON.stringify({ type: "delta", text }));
      }
      socket.send(
        JSON.stringify({
          type: "done",
          runId: "r",
          status: isError ? "error" : "done",
          text,
          errorMessage: errorMessage ?? null,
          steps: [],
          block: null,
          degraded: { active: false },
          suggestion: isError ? null : suggestion,
        }),
      );
    },
  };
};
