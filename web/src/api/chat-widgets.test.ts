import { expect, it, vi } from "vitest";

import { openTelegramLoginPopup } from "./chat-widgets.ts";

it("shares a pending SDK load and can retry after a network failure", async () => {
  const first = openTelegramLoginPopup("123", "nonce-a");
  const second = openTelegramLoginPopup("123", "nonce-b");
  const scripts = document.querySelectorAll("script[src*='telegram-login.js']");
  expect(scripts).toHaveLength(1);
  scripts[0]?.dispatchEvent(new Event("error"));
  const failed = await Promise.allSettled([first, second]);
  expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);

  const retry = openTelegramLoginPopup("123", "nonce-c");
  const script = document.querySelector("#hse-telegram-login-script");
  expect(script).not.toBe(scripts[0]);
  vi.stubGlobal("Telegram", {
    Login: {
      auth: (_options: unknown, done: (result: { id_token: string }) => void) => {
        done({ id_token: "test-token" });
      },
    },
  });
  try {
    script?.dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe("test-token");
  } finally {
    vi.unstubAllGlobals();
    script?.remove();
  }
});
