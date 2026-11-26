import type { Page } from "@playwright/test";

import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";

/** Playwright's route.fulfill buffers bodies. Write actual HTTP chunks so the UI can act between them. */
export const mockMessageStream = async (page: Page, shouldHoldMeta: boolean) => {
  let isTitleHeld = false;
  const received = Promise.withResolvers<boolean>();
  const sent: Record<string, unknown>[] = [];
  let response: ServerResponse | undefined;
  const send = (frame: unknown): void => {
    if (response === undefined) {
      throw new Error("No message request received");
    }
    response.write(`${JSON.stringify(frame)}\n`);
  };
  const sendTitle = (): void => {
    send({ type: "title", threadId: "t", title: "Новая тема" });
  };
  const sendMeta = (): void => {
    send({
      type: "meta",
      threadId: "t",
      runId: "r",
      assistantMessageId: "a",
      userMessageId: "u",
      threadTitle: "Вопрос",
      generatedTitle: null,
      degraded: { active: false },
    });
    if (!isTitleHeld) {
      sendTitle();
    }
  };
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    req.resume();
    response = res;
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.flushHeaders();
    received.resolve(true);
    if (!shouldHoldMeta) {
      sendMeta();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  page.once("close", () => {
    server.closeAllConnections();
    server.close();
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("Missing stream fixture port");
  }
  const url = `http://127.0.0.1:${addr.port}/v1/messages`;
  await page.route("http://127.0.0.1:8787/v1/messages", async (route) => {
    if (route.request().method() === "POST") {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
    }
    await route.continue({ url });
  });
  return {
    sent,
    send,
    sendMeta,
    sendTitle,
    holdTitle: () => {
      isTitleHeld = true;
    },
    received: received.promise,
    end: () => response?.end(),
  };
};
