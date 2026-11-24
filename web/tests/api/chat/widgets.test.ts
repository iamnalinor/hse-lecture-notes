import { expect, it, vi } from "vitest";

import { openTelegramLoginPopup } from "#web/api/chat/widgets.ts";

vi.mock("@fingerprintjs/fingerprintjs", () => ({
  load: () => Promise.resolve({ get: () => Promise.resolve({ visitorId: "fingerprint" }) }),
}));

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

it("mounts on warmup, keeps the background challenge hidden and reuses the same widget", async () => {
  vi.resetModules();
  const { warmupChatWidgets, requestTurnstileToken, cancelActiveTurnstile } = await import(
    "#web/api/chat/widgets.ts"
  );
  const render = vi.fn().mockReturnValue("widget");
  const reset = vi.fn();
  const remove = vi.fn();
  const fetchMock = vi.fn();
  vi.stubGlobal("turnstile", { render, reset, remove });
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.append(host);
  const hooks = {
    getContainer: () => host,
    onInteractiveOpen: vi.fn(),
    onInteractiveClose: vi.fn(),
  };
  try {
    warmupChatWidgets("key", hooks);
    warmupChatWidgets("key", hooks);
    const script = document.querySelector("#hse-turnstile-script");
    script?.dispatchEvent(new Event("load"));
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledOnce();
    });
    const options = render.mock.calls[0]?.[1] as {
      callback: (token: string) => void;
      "before-interactive-callback": () => void;
    };
    options["before-interactive-callback"]();
    expect(hooks.onInteractiveOpen).not.toHaveBeenCalled();
    cancelActiveTurnstile();
    options.callback("prepared");
    await expect(requestTurnstileToken("key", hooks, new AbortController().signal)).resolves.toBe(
      "prepared",
    );
    expect(reset).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    host.remove();
    document.querySelector("#hse-turnstile-script")?.remove();
  }
});

it("replaces a disconnected host and targets the new provider's modal callbacks", async () => {
  vi.resetModules();
  const { warmupChatWidgets, requestTurnstileToken } = await import("#web/api/chat/widgets.ts");
  const render = vi.fn().mockReturnValueOnce("old-widget").mockReturnValueOnce("new-widget");
  const reset = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal("turnstile", { render, reset, remove });
  const oldHost = document.createElement("div");
  const newHost = document.createElement("div");
  const oldHooks = {
    getContainer: () => oldHost,
    onInteractiveOpen: vi.fn(),
    onInteractiveClose: vi.fn(),
  };
  const newHooks = { ...oldHooks, getContainer: () => newHost, onInteractiveOpen: vi.fn() };
  document.body.append(oldHost);
  try {
    warmupChatWidgets("key", oldHooks);
    document.querySelector("#hse-turnstile-script")?.dispatchEvent(new Event("load"));
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledOnce();
    });
    oldHost.remove();
    document.body.append(newHost);
    warmupChatWidgets("key", newHooks);
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledTimes(2);
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith("old-widget");
    const callbacks = render.mock.calls[1]?.[1] as {
      callback: (token: string) => void;
      "before-interactive-callback": () => void;
    };
    callbacks["before-interactive-callback"]();
    expect(newHooks.onInteractiveOpen).not.toHaveBeenCalled();
    const pending = requestTurnstileToken("key", newHooks, new AbortController().signal);
    await vi.waitFor(() => {
      expect(newHooks.onInteractiveOpen).toHaveBeenCalled();
    });
    expect(oldHooks.onInteractiveOpen).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    callbacks.callback("fresh");
    await expect(pending).resolves.toBe("fresh");
    expect(render).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    oldHost.remove();
    newHost.remove();
    document.querySelector("#hse-turnstile-script")?.remove();
  }
});
