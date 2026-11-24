import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { captureRejection } from "#web/test/capture-rejection.ts";

import { ensureChatAllowance } from "./chat-access.ts";
import { loginViaTelegram } from "./chat-client.ts";
import { saveAllowanceToken, saveBrowserToken, saveSessionAuth } from "./chat-storage.ts";
import {
  getBrowserFingerprint,
  openTelegramLoginPopup,
  requestTurnstileToken,
  subscribeTurnstileCancellation,
} from "./chat-widgets.ts";

vi.mock("./chat-widgets.ts", () => ({
  getBrowserFingerprint: vi.fn(),
  requestTurnstileToken: vi.fn(),
  openTelegramLoginPopup: vi.fn(),
  subscribeTurnstileCancellation: vi.fn(),
}));

const hooks = {
  getContainer: () => document.body,
  onInteractiveOpen: vi.fn(),
  onInteractiveClose: vi.fn(),
};
const response = () => ({
  allowanceExpiresAt: Date.now() + 1_800_000,
  allowanceToken: "allowance",
  browserToken: "browser",
  block: null,
  degraded: { active: false },
  tier: "guest",
  user: null,
});
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubEnv("VITE_CHAT_API_URL", "https://api.test");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "key");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getBrowserFingerprint).mockResolvedValue("fingerprint");
  vi.mocked(requestTurnstileToken).mockResolvedValue("turnstile");
  vi.mocked(subscribeTurnstileCancellation).mockReturnValue(vi.fn());
  fetchMock.mockImplementation(() => Promise.resolve(Response.json(response())));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("coalesces parallel callers and posts the prepared token without cookies", async () => {
  const [first, second] = await Promise.all([
    ensureChatAllowance(hooks),
    ensureChatAllowance(hooks),
  ]);
  expect(first).toEqual(second);
  expect(requestTurnstileToken).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "https://api.test/v1/allowance",
    expect.objectContaining({
      credentials: "omit",
      body: JSON.stringify({ fingerprint: "fingerprint", turnstileToken: "turnstile" }),
    }),
  );
  expect(localStorage.getItem("hse_chat_browser_token")).toBe("browser");
});

it("skips browser verification and its UI state while allowance is valid", async () => {
  saveBrowserToken("browser");
  saveAllowanceToken("cached", Date.now() + 120_000);
  const onChecking = vi.fn();
  await expect(ensureChatAllowance(hooks, { onChecking })).resolves.toMatchObject({
    allowanceToken: "cached",
  });
  expect(onChecking).not.toHaveBeenCalled();
  expect(requestTurnstileToken).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rechecks localStorage after acquiring the Web Lock", async () => {
  const acquired = Promise.withResolvers<undefined>();
  const request = vi.fn(async (_name: string, _options: unknown, work: () => Promise<unknown>) => {
    await acquired.promise;
    return await work();
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    const pending = ensureChatAllowance(hooks);
    saveBrowserToken("other-tab");
    saveAllowanceToken("shared", Date.now() + 120_000);
    acquired.resolve(undefined);
    await expect(pending).resolves.toMatchObject({ allowanceToken: "shared" });
    expect(requestTurnstileToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    Reflect.deleteProperty(navigator, "locks");
  }
});

it("aborts one consumer without cancelling another consumer of the same request", async () => {
  const token = Promise.withResolvers<string>();
  vi.mocked(requestTurnstileToken).mockReturnValue(token.promise);
  const controller = new AbortController();
  const first = ensureChatAllowance(hooks, { signal: controller.signal });
  const second = ensureChatAllowance(hooks);
  const rejected = captureRejection(first);
  controller.abort(new Error("stopped"));
  expect((await rejected).message).toContain("stopped");
  expect(vi.mocked(requestTurnstileToken).mock.calls[0]?.[2].aborted).toBe(false);
  token.resolve("ready");
  await expect(second).resolves.toMatchObject({ allowanceToken: "allowance" });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("bounds a stalled verification and allows a later retry", async () => {
  vi.useFakeTimers();
  vi.mocked(requestTurnstileToken).mockReturnValueOnce(new Promise(() => undefined));
  const pending = ensureChatAllowance(hooks);
  const rejected = captureRejection(pending);
  await vi.advanceTimersByTimeAsync(120_000);
  expect((await rejected).message).toContain("timed out");
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({ allowanceToken: "allowance" });
});

it("releases the Web Lock when fingerprinting stalls after a token is ready", async () => {
  vi.useFakeTimers();
  vi.mocked(getBrowserFingerprint).mockReturnValueOnce(new Promise(() => undefined));
  let isLocked = false;
  const request = vi.fn(async (_name: string, _options: unknown, work: () => Promise<unknown>) => {
    expect(isLocked).toBe(false);
    isLocked = true;
    try {
      return await work();
    } finally {
      isLocked = false;
    }
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    const rejected = captureRejection(ensureChatAllowance(hooks));
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await rejected).message).toContain("timed out");
    expect(isLocked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({
      allowanceToken: "allowance",
    });
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    Reflect.deleteProperty(navigator, "locks");
  }
});

it("cancels a pending action before the widget SDK has loaded", async () => {
  vi.mocked(requestTurnstileToken).mockReturnValueOnce(new Promise(() => undefined));
  const pending = ensureChatAllowance(hooks);
  const rejected = captureRejection(pending);
  vi.mocked(subscribeTurnstileCancellation).mock.calls[0]?.[0]();
  expect((await rejected).message).toContain("Turnstile cancelled");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not save a late response from a different session", async () => {
  const result = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(result.promise);
  const pending = ensureChatAllowance(hooks);
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  saveSessionAuth("new-session", "internal", { id: 1, name: "User" });
  const rejected = captureRejection(pending);
  result.resolve(Response.json(response()));
  expect((await rejected).message).toContain("session changed");
  expect(localStorage.getItem("hse_chat_allowance_token")).toBeNull();
});

it("exposes an HTTP failure and releases the shared request for retry", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
  await expect(ensureChatAllowance(hooks)).rejects.toThrow("Allowance error (403)");
  await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({ allowanceToken: "allowance" });
});

it("gets separate single-use tokens before and after Telegram login and sends the new session explicitly", async () => {
  vi.mocked(openTelegramLoginPopup).mockResolvedValue("telegram-id-token");
  vi.mocked(requestTurnstileToken)
    .mockResolvedValueOnce("first")
    .mockResolvedValueOnce("prepared-next");
  fetchMock.mockImplementation((input) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/v1/auth/nonce")) {
      return Promise.resolve(Response.json({ nonce: "nonce" }));
    }
    if (path.endsWith("/v1/auth/telegram")) {
      return Promise.resolve(
        Response.json({
          browserToken: "browser",
          sessionToken: "session",
          tier: "internal",
          user: { id: 1, name: "User" },
        }),
      );
    }
    const isLoggedIn = localStorage.getItem("hse_chat_session_token") !== null;
    return Promise.resolve(
      Response.json({
        ...response(),
        tier: isLoggedIn ? "internal" : "guest",
        user: isLoggedIn ? { id: 1, name: "User" } : null,
      }),
    );
  });
  await expect(loginViaTelegram(hooks)).resolves.toMatchObject({
    tier: "internal",
    user: { id: 1 },
  });
  const posts = fetchMock.mock.calls.filter(
    ([url]) => typeof url === "string" && url.endsWith("/v1/allowance"),
  );
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[0]?.[1]?.body as string) as unknown).toMatchObject({
    turnstileToken: "first",
  });
  expect(JSON.parse(posts[1]?.[1]?.body as string) as unknown).toMatchObject({
    turnstileToken: "prepared-next",
    sessionToken: "session",
  });
  expect(new Headers(posts[1]?.[1]?.headers).get("X-Session-Token")).toBe("session");
});
