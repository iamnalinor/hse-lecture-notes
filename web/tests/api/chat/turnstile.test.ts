import { afterEach, expect, it, vi } from "vitest";

import { ManagedTurnstile, type TurnstileApi } from "#web/api/chat/turnstile.ts";

import { captureRejection } from "../../support/capture-rejection.ts";

const mountWidget = () => {
  const api = {
    render: vi.fn<TurnstileApi["render"]>().mockReturnValue("widget"),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  const hooks = {
    getContainer: () => document.body,
    onInteractiveOpen: vi.fn(),
    onInteractiveClose: vi.fn(),
  };
  const widget = new ManagedTurnstile(api, document.body, { siteKey: "key", hooks });
  const callbacks = api.render.mock.calls[0]?.[1];
  if (callbacks === undefined) {
    throw new Error("Widget was not rendered");
  }
  return { api, callbacks, hooks, widget };
};

afterEach(() => {
  vi.useRealTimers();
});

it("renders a persistent Managed widget with automatic verification and refresh", () => {
  const { api, callbacks } = mountWidget();
  expect(callbacks).toMatchObject({
    execution: "render",
    appearance: "interaction-only",
    "refresh-expired": "auto",
    "refresh-timeout": "auto",
    retry: "auto",
  });
  callbacks.callback("background-token");
  callbacks["error-callback"]();
  expect(api.remove).not.toHaveBeenCalled();
  expect(api.reset).not.toHaveBeenCalled();
});

it("waits for background verification and consumes each token only once", async () => {
  const { api, callbacks, hooks, widget } = mountWidget();
  const first = widget.request(new AbortController().signal);
  expect(api.reset).not.toHaveBeenCalled();
  callbacks.callback("first");
  await expect(first).resolves.toBe("first");
  expect(api.reset).toHaveBeenCalledExactlyOnceWith("widget");
  const second = widget.request(new AbortController().signal);
  callbacks.callback("second");
  await expect(second).resolves.toBe("second");
  expect(api.render).toHaveBeenCalledOnce();
  expect(hooks.onInteractiveOpen).not.toHaveBeenCalled();
});

it("uses an unused background token immediately and prepares its replacement", async () => {
  const { api, callbacks, widget } = mountWidget();
  callbacks.callback("ready");
  await expect(widget.request(new AbortController().signal)).resolves.toBe("ready");
  expect(api.reset).toHaveBeenCalledOnce();
  callbacks.callback("next");
  await expect(widget.request(new AbortController().signal)).resolves.toBe("next");
  expect(api.render).toHaveBeenCalledOnce();
});

it("reveals a prepared challenge only on demand and follows interactive refreshes", async () => {
  const { api, callbacks, hooks, widget } = mountWidget();
  callbacks["before-interactive-callback"]();
  expect(hooks.onInteractiveOpen).not.toHaveBeenCalled();
  const pending = widget.request(new AbortController().signal);
  expect(hooks.onInteractiveOpen).toHaveBeenCalledOnce();
  expect(api.reset).not.toHaveBeenCalled();
  callbacks["timeout-callback"]();
  expect(hooks.onInteractiveClose).toHaveBeenCalled();
  callbacks["before-interactive-callback"]();
  expect(hooks.onInteractiveOpen).toHaveBeenCalledTimes(2);
  callbacks["after-interactive-callback"]();
  expect(hooks.onInteractiveClose).toHaveBeenCalledTimes(3);
  callbacks.callback("verified");
  await expect(pending).resolves.toBe("verified");
  expect(api.render).toHaveBeenCalledOnce();
});

it("cancels the wait without destroying or restarting a prepared challenge", async () => {
  const { api, callbacks, hooks, widget } = mountWidget();
  callbacks["before-interactive-callback"]();
  const pending = widget.request(new AbortController().signal);
  const rejected = captureRejection(pending);
  widget.cancel();
  expect((await rejected).message).toContain("Turnstile cancelled");
  expect(hooks.onInteractiveClose).toHaveBeenCalled();
  const retry = widget.request(new AbortController().signal);
  callbacks.callback("after-cancel");
  await expect(retry).resolves.toBe("after-cancel");
  expect(api.reset).toHaveBeenCalledOnce();
  expect(api.remove).not.toHaveBeenCalled();
});

it("drops an expired token even before Cloudflare sends its expiry callback", async () => {
  vi.useFakeTimers();
  const { api, callbacks, widget } = mountWidget();
  callbacks.callback("stale");
  vi.setSystemTime(Date.now() + 300_000);
  const pending = widget.request(new AbortController().signal);
  expect(api.reset).toHaveBeenCalledOnce();
  callbacks.callback("fresh");
  await expect(pending).resolves.toBe("fresh");
});

it("lets Cloudflare refresh expired tokens automatically without a duplicate reset", async () => {
  const { api, callbacks, hooks, widget } = mountWidget();
  callbacks.callback("stale");
  callbacks["expired-callback"]();
  const pending = widget.request(new AbortController().signal);
  expect(api.reset).not.toHaveBeenCalled();
  expect(hooks.onInteractiveOpen).not.toHaveBeenCalled();
  callbacks.callback("fresh");
  await expect(pending).resolves.toBe("fresh");
});

it("recovers from a failed background check through the existing widget", async () => {
  const { api, callbacks, widget } = mountWidget();
  callbacks["error-callback"]();
  const pending = widget.request(new AbortController().signal);
  expect(api.reset).toHaveBeenCalledOnce();
  const rejected = captureRejection(pending);
  callbacks["error-callback"]();
  expect((await rejected).message).toContain("verification error");
  callbacks.callback("auto-retry");
  await expect(widget.request(new AbortController().signal)).resolves.toBe("auto-retry");
  expect(api.render).toHaveBeenCalledOnce();
});

it("closes interaction when the caller aborts while preserving background verification", async () => {
  const { callbacks, hooks, widget } = mountWidget();
  const controller = new AbortController();
  const pending = widget.request(controller.signal);
  callbacks["before-interactive-callback"]();
  const rejected = captureRejection(pending);
  controller.abort(new Error("stopped"));
  expect((await rejected).message).toContain("stopped");
  expect(hooks.onInteractiveClose).toHaveBeenCalled();
  callbacks["before-interactive-callback"]();
  expect(hooks.onInteractiveOpen).toHaveBeenCalledOnce();
  callbacks.callback("background");
  await expect(widget.request(new AbortController().signal)).resolves.toBe("background");
});
