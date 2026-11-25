import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ensureChatAllowance } from "#web/api/chat/access.ts";
import { loginViaTelegram } from "#web/api/chat/client.ts";
import { readStoredAuth } from "#web/api/chat/storage.ts";
import {
  getBrowserFingerprint,
  openTelegramLoginPopup,
  requestTurnstileToken,
  subscribeTurnstileCancellation,
} from "#web/api/chat/widgets.ts";

import { captureRejection } from "../../support/capture-rejection.ts";
import { seedChatAuth } from "../../support/chat-auth.ts";

vi.mock("#web/api/chat/widgets.ts", () => ({
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
  expect(readStoredAuth().browserToken).toBe("browser");
});

it("skips browser verification and its UI state while allowance is valid", async () => {
  seedChatAuth({ browserToken: "browser" });
  seedChatAuth({ allowanceToken: "cached", allowanceExpiresAt: Date.now() + 120_000 });
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
    seedChatAuth({ browserToken: "other-tab" });
    seedChatAuth({ allowanceToken: "shared", allowanceExpiresAt: Date.now() + 120_000 });
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
  const locked = new Set<string>();
  const request = vi.fn(async (name: string, _options: unknown, work: () => Promise<unknown>) => {
    expect(locked.has(name)).toBe(false);
    locked.add(name);
    try {
      return await work();
    } finally {
      locked.delete(name);
    }
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    const rejected = captureRejection(ensureChatAllowance(hooks));
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await rejected).message).toContain("timed out");
    expect(locked.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({
      allowanceToken: "allowance",
    });
    expect(
      request.mock.calls.filter(([name]) => name === "hse-chat-browser-token-init"),
    ).toHaveLength(2);
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
  seedChatAuth({ sessionToken: "new-session", tier: "student", user: { id: 1, name: "User" } });
  const rejected = captureRejection(pending);
  result.resolve(Response.json(response()));
  expect((await rejected).message).toContain("session changed");
  expect(readStoredAuth().allowanceToken).toBeNull();
});

it("exposes an HTTP failure and releases the shared request for retry", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
  await expect(ensureChatAllowance(hooks)).rejects.toThrow("HTTP 403");
  await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({ allowanceToken: "allowance" });
});

it("gets separate single-use tokens before and after Telegram login and sends the new session explicitly", async () => {
  vi.mocked(openTelegramLoginPopup).mockResolvedValue("telegram-id-token");
  const verification = Promise.withResolvers<string>();
  vi.mocked(requestTurnstileToken)
    .mockReturnValueOnce(verification.promise)
    .mockResolvedValueOnce("prepared-next");
  fetchMock.mockImplementation((input) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/v1/auth/telegram")) {
      return Promise.resolve(
        Response.json({
          browserToken: "browser",
          sessionToken: "session",
          tier: "student",
          user: { id: 1, name: "User" },
        }),
      );
    }
    const isLoggedIn = readStoredAuth().sessionToken !== null;
    return Promise.resolve(
      Response.json({
        ...response(),
        tier: isLoggedIn ? "student" : "guest",
        user: isLoggedIn ? { id: 1, name: "User" } : null,
      }),
    );
  });
  const login = loginViaTelegram(hooks);
  expect(openTelegramLoginPopup).toHaveBeenCalledOnce();
  await vi.waitFor(() => {
    expect(requestTurnstileToken).toHaveBeenCalledOnce();
  });
  expect(fetchMock).not.toHaveBeenCalled();
  verification.resolve("first");
  await expect(login).resolves.toMatchObject({
    tier: "student",
    user: { id: 1 },
  });
  await ensureChatAllowance(hooks);
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

it("shows the server's explanation, code and detail instead of a bare status (D1 limit, 25.11.2026)", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json(
      {
        code: "storage_quota_exceeded",
        detail: "D1_ERROR: daily row read limit",
        message: "Хранилище чата исчерпало дневной лимит Cloudflare D1.",
      },
      { status: 503 },
    ),
  );
  const error = await captureRejection(ensureChatAllowance(hooks));
  expect(error.message).toBe(
    "Хранилище чата исчерпало дневной лимит Cloudflare D1. (storage_quota_exceeded, HTTP 503: D1_ERROR: daily row read limit)",
  );
});

it("keeps the previous account while Telegram is open and when login is cancelled", async () => {
  seedChatAuth({ browserToken: "browser" });
  seedChatAuth({ sessionToken: "old", tier: "student", user: { id: 1, name: "Old" } });
  const popup = Promise.withResolvers<string>();
  vi.mocked(openTelegramLoginPopup).mockReturnValueOnce(popup.promise);
  const login = loginViaTelegram(hooks);
  expect(openTelegramLoginPopup).toHaveBeenCalledOnce();
  expect(fetchMock).not.toHaveBeenCalled();
  popup.reject(new Error("cancelled"));
  await expect(login).rejects.toThrow("cancelled");
  expect(readStoredAuth().sessionToken).toBe("old");
  expect(fetchMock).not.toHaveBeenCalled();
});

const previousAccount = () => {
  seedChatAuth({
    browserToken: "browser",
    sessionToken: "old",
    tier: "student",
    user: { id: 1, name: "Old" },
    allowanceToken: "old-allowance",
    allowanceExpiresAt: Date.now() + 120_000,
  });
  return readStoredAuth();
};

const replacement = {
  browserToken: "new-browser",
  sessionToken: "new",
  tier: "extended",
  user: { id: 2, name: "New" },
};

it("keeps the old credentials until Telegram exchange succeeds, then replaces the whole account", async () => {
  const previous = previousAccount();
  vi.mocked(openTelegramLoginPopup).mockResolvedValue("signed");
  const exchange = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(exchange.promise);
  const login = loginViaTelegram(hooks);
  expect(openTelegramLoginPopup).toHaveBeenCalledOnce();
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.test/v1/auth/telegram",
      expect.anything(),
    );
  });
  const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
  expect(headers.get("X-Browser-Token")).toBe("browser");
  expect(headers.has("X-Session-Token")).toBe(false);
  expect(readStoredAuth()).toEqual(previous);
  exchange.resolve(Response.json(replacement));
  await login;
  expect(readStoredAuth()).toEqual({ ...replacement, allowanceToken: null, allowanceExpiresAt: 0 });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([401, 503, 200])(
  "preserves the previous session and cached allowance on an invalid exchange (%i)",
  async (status) => {
    const previous = previousAccount();
    vi.mocked(openTelegramLoginPopup).mockResolvedValue("signed");
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({}, { status })));
    await expect(loginViaTelegram(hooks)).rejects.toThrow();
    expect(readStoredAuth()).toEqual(previous);
  },
);

it("ignores a late exchange after another tab has selected an account", async () => {
  previousAccount();
  vi.mocked(openTelegramLoginPopup).mockResolvedValue("signed");
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  const login = loginViaTelegram(hooks);
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  seedChatAuth({ sessionToken: "other", tier: "extended", user: { id: 4, name: "Other tab" } });
  const other = readStoredAuth();
  pending.resolve(Response.json(replacement));
  await expect(login).rejects.toThrow("session changed");
  expect(readStoredAuth()).toEqual(other);
});

it("serializes guest login exchanges so both tabs keep the account that claimed guest history", async () => {
  seedChatAuth({ browserToken: "browser" });
  const queues = new Map<string, Promise<undefined>>();
  const request = async (name: string, _options: unknown, work: () => Promise<unknown>) => {
    const previous = queues.get(name);
    const done = Promise.withResolvers<undefined>();
    queues.set(name, done.promise);
    await previous;
    try {
      return await work();
    } finally {
      done.resolve(undefined);
    }
  };
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    vi.mocked(openTelegramLoginPopup)
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    const exchange = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(exchange.promise);
    const first = loginViaTelegram(hooks);
    const second = captureRejection(loginViaTelegram(hooks));
    expect(openTelegramLoginPopup).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    exchange.resolve(Response.json(replacement));
    await first;
    expect((await second).message).toContain("session changed");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readStoredAuth().user).toEqual(replacement.user);
  } finally {
    Reflect.deleteProperty(navigator, "locks");
  }
});

it("drops an expired account when the server grants guest access and rejects its pending action", async () => {
  seedChatAuth({
    browserToken: "browser",
    sessionToken: "expired",
    user: { id: 12, name: "Expired" },
    tier: "extended",
  });
  await expect(ensureChatAllowance(hooks)).rejects.toThrow("session changed");
  expect(readStoredAuth()).toMatchObject({
    browserToken: "browser",
    sessionToken: null,
    user: null,
    tier: "guest",
  });
  await expect(ensureChatAllowance(hooks)).resolves.toMatchObject({ tier: "guest" });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("retains the active question limit on cached allowances", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...response(), maxQuestionChars: 3650 }));
  await ensureChatAllowance(hooks);
  expect(await ensureChatAllowance(hooks)).toMatchObject({ maxQuestionChars: 3650 });
  expect(fetchMock).toHaveBeenCalledOnce();
});
