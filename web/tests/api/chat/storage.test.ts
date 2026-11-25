import { afterEach, expect, it, vi } from "vitest";

import {
  readPageThread,
  readStoredAuth,
  replaceChatAuth,
  savePageThread,
  subscribeAuthStorage,
} from "#web/api/chat/storage.ts";

import { seedChatAuth } from "../../support/chat-auth.ts";

afterEach(() => {
  localStorage.clear();
});
it.each(["default", "student", "extended"] as const)(
  "restores the %s account after a reload",
  (tier) => {
    const user = { id: 42, name: "Student" };
    seedChatAuth({ sessionToken: "session", tier, user });
    expect(readStoredAuth()).toMatchObject({ sessionToken: "session", tier, user });
  },
);

it.each(["session", "session_v2"])(
  "restores only supported sessions from the legacy %s cache",
  (typ) => {
    const token = `header.${btoa(JSON.stringify({ typ }))}.signature`;
    localStorage.setItem("hse_chat_browser_token", "browser");
    localStorage.setItem("hse_chat_session_token", token);
    localStorage.setItem("hse_chat_tier", "extended");
    localStorage.setItem("hse_chat_user", JSON.stringify({ id: 3, name: "Legacy" }));
    localStorage.setItem("hse_chat_allowance_token", "allowance");
    localStorage.setItem("hse_chat_allowance_exp", "10000");
    expect(readStoredAuth()).toEqual(
      typ === "session_v2"
        ? {
            browserToken: "browser",
            sessionToken: token,
            tier: "extended",
            user: { id: 3, name: "Legacy" },
            allowanceToken: "allowance",
            allowanceExpiresAt: 10_000,
          }
        : {
            browserToken: "browser",
            sessionToken: null,
            tier: "guest",
            user: null,
            allowanceToken: null,
            allowanceExpiresAt: 0,
          },
    );
  },
);

it("opens as a guest when an auth record is damaged", () => {
  localStorage.setItem("hse_chat_auth", "broken");
  expect(readStoredAuth()).toMatchObject({
    tier: "guest",
    user: null,
    sessionToken: null,
    allowanceToken: null,
  });
});

it("preserves a legacy guest's browser identity and allowance", () => {
  localStorage.setItem("hse_chat_browser_token", "guest-browser");
  localStorage.setItem("hse_chat_allowance_token", "guest-allowance");
  localStorage.setItem("hse_chat_allowance_exp", "12345");
  expect(readStoredAuth()).toEqual({
    browserToken: "guest-browser",
    sessionToken: null,
    tier: "guest",
    user: null,
    allowanceToken: "guest-allowance",
    allowanceExpiresAt: 12_345,
  });
});

const unavailable = () => {
  throw new DOMException("Storage unavailable", "SecurityError");
};

it("retains auth and thread changes in this tab when storage throws", async () => {
  const auth = { ...readStoredAuth(), browserToken: "private-browser" };
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(unavailable);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(unavailable);
  try {
    await replaceChatAuth(null, auth);
    expect(readStoredAuth()).toEqual(auth);
    savePageThread("private", "new");
    expect(readPageThread("private")).toBe("new");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(unavailable);
    expect(readStoredAuth()).toEqual(auth);
    savePageThread("private", null);
    expect(readPageThread("private")).toBeNull();
  } finally {
    vi.restoreAllMocks();
    globalThis.dispatchEvent(new StorageEvent("storage", { key: null }));
  }
});

it("honors storage changes from another tab after a failed local write", () => {
  localStorage.setItem("hse_chat_thread:shared", "old");
  const write = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Storage unavailable", "SecurityError");
  });
  const stop = subscribeAuthStorage(vi.fn());
  try {
    savePageThread("shared", null);
    expect(readPageThread("shared")).toBeNull();
    write.mockRestore();
    localStorage.setItem("hse_chat_thread:shared", "other-tab");
    globalThis.dispatchEvent(
      new StorageEvent("storage", { key: "hse_chat_thread:shared", newValue: "other-tab" }),
    );
    expect(readPageThread("shared")).toBe("other-tab");
  } finally {
    write.mockRestore();
    stop();
  }
});

it("keeps persisted legacy credentials when migrating them in memory after a failed write", async () => {
  localStorage.setItem("hse_chat_browser_token", "legacy");
  const auth = { ...readStoredAuth(), allowanceToken: "fresh" };
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  try {
    await replaceChatAuth(null, auth);
    expect(readStoredAuth()).toEqual(auth);
    expect(localStorage.getItem("hse_chat_browser_token")).toBe("legacy");
  } finally {
    write.mockRestore();
    globalThis.dispatchEvent(new StorageEvent("storage", { key: null }));
  }
});
