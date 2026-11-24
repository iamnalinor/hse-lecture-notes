import type { ReactNode } from "react";

import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ChatMessage } from "#web/domain/chat.ts";

import {
  ensureChatAllowance,
  fetchChatRunStatus,
  fetchChatThread,
  loginViaTelegram,
  type ThreadResponse,
} from "#web/api/chat-client.ts";
import { saveBrowserToken, saveSessionAuth } from "#web/api/chat-storage.ts";
import { openChatMessageStream } from "#web/api/chat-stream.ts";

import { ChatProvider, useChat } from "./chat-context.tsx";
import { makeAssistantMsg, makeUserMsg } from "./chat-stream-helpers.ts";

vi.mock("#web/api/chat-client.ts", () => ({
  ensureChatAllowance: vi.fn(),
  fetchChatRunStatus: vi.fn(),
  fetchChatThread: vi.fn(),
  getChatEnvConfig: () => ({ apiUrl: "https://example.test" }),
  isChatConfigured: () => true,
  loginViaTelegram: vi.fn(),
  logoutChatSession: vi.fn(),
}));
vi.mock("#web/api/chat-stream.ts", () => ({ openChatMessageStream: vi.fn() }));
vi.mock("#web/api/chat-widgets.ts", () => ({
  cancelActiveTurnstile: vi.fn(),
  warmupChatWidgets: vi.fn(),
}));

const mount = () =>
  renderHook(() => useChat(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  }).result;

const thread = (id: string, messages: readonly ChatMessage[] = []): ThreadResponse => ({
  requestedThreadMissing: false,
  thread: { id, title: id, messages, createdAt: 1, updatedAt: 1 },
  threads: [{ id, title: id, updatedAt: 1 }],
});

const allowance = {
  allowanceExpiresAt: 10_000,
  allowanceToken: "allowance",
  block: null,
  browserToken: "browser",
  degraded: { active: false },
  tier: "guest",
  user: null,
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.mocked(ensureChatAllowance).mockResolvedValue(allowance);
  vi.mocked(openChatMessageStream).mockReturnValue({ stop: vi.fn(), disconnect: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("discards another account's late history after a storage event", async () => {
  saveBrowserToken("browser");
  saveSessionAuth("account1", "internal", { id: 1, name: "one" });
  const pending = Promise.withResolvers<ThreadResponse>();
  vi.mocked(fetchChatThread)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(thread("two"));
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  await act(async () => {
    saveSessionAuth("account2", "internal", { id: 2, name: "two" });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_user" }));
    await Promise.resolve();
  });
  expect(chat.current.activeThreadId).toBeNull();
  await act(async () => {
    pending.resolve(thread("one"));
    await pending.promise;
  });
  expect(chat.current.threads.map((t) => t.id)).toEqual(["two"]);
});

it("keeps deltas in their thread and restores a refused retry", async () => {
  const chat = mount();
  await act(() => chat.current.send("Q"));
  const callbacks = vi.mocked(openChatMessageStream).mock.calls[0]?.[2];
  if (callbacks === undefined) {
    throw new Error("missing stream");
  }
  act(() => {
    callbacks.onMeta({
      assistantMessageId: "a",
      userMessageId: "u",
      runId: "r",
      threadId: "t",
      threadTitle: "title",
      degraded: { active: false },
    });
  });
  act(() => {
    chat.current.selectThread("other");
    chat.current.newChat();
    callbacks.onDelta("answer");
  });
  expect(chat.current.activeThreadId).toBe("t");
  expect(fetchChatThread).not.toHaveBeenCalled();
  act(() => {
    callbacks.onDone({
      text: "answer",
      status: "done",
      steps: [],
      block: null,
      degraded: { active: false },
      runId: "r",
    });
  });
  const saved = chat.current.messages;
  await act(() => chat.current.retryMessage("a"));
  const retry = vi.mocked(openChatMessageStream).mock.calls.at(-1);
  expect(retry?.[1].retryAssistantMessageId).toBe("a");
  const first = vi.mocked(openChatMessageStream).mock.calls[0];
  expect(retry?.[1].clientRequestId).not.toBe(first?.[1].clientRequestId);
  act(() =>
    retry?.[2].onError({
      code: "blocked",
      message: "wait",
      block: { code: "service_unavailable" },
    }),
  );
  expect(chat.current.messages).toEqual(saved);
});

it("reuses the same request ID after a disconnect before meta", async () => {
  const chat = mount();
  await act(() => chat.current.send("Q"));
  act(() => vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onCloseUnexpected());
  const last = chat.current.messages.at(-1);
  expect(last?.status).toBe("error");
  if (last === undefined) {
    throw new Error("missing answer");
  }
  await act(() => chat.current.retryMessage(last.id));
  expect(
    vi.mocked(openChatMessageStream).mock.calls.at(-1)?.[1].retryAssistantMessageId,
  ).toBeNull();
  const sends = vi.mocked(openChatMessageStream).mock.calls;
  expect(sends[1]?.[1].clientRequestId).toBe(sends[0]?.[1].clientRequestId);
  expect(chat.current.messages).toHaveLength(2);
});

it("polls a restored running turn through a failed request to completion", async () => {
  vi.useFakeTimers();
  saveBrowserToken("browser");
  const answer = { ...makeAssistantMsg({ course: "", docId: "" }), id: "assistant", runId: "run" };
  const user = makeUserMsg("Q", null, { course: "", docId: "" });
  vi.mocked(fetchChatThread)
    .mockResolvedValueOnce(thread("t", [user, answer]))
    .mockResolvedValueOnce(thread("t", [user, { ...answer, status: "done", contentTex: "A" }]));
  vi.mocked(fetchChatRunStatus).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
    runId: "run",
    assistantMessageId: "assistant",
    threadId: "t",
    status: "done",
    expiresAt: 1000,
  });
  localStorage.setItem("hse_chat_thread:guest:/", "t");
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  expect(chat.current.isStreaming).toBe(true);
  expect(chat.current.canStop).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(4500));
  expect(chat.current.isStreaming).toBe(false);
  expect(chat.current.messages.at(-1)?.contentTex).toBe("A");
});

it("restores the draft and unlocks a quota block at its deadline", async () => {
  vi.useFakeTimers();
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "tier_quota_exceeded", nextAvailableAt: Date.now() + 1000 },
  });
  const chat = mount();
  await act(() => chat.current.send("draft"));
  expect(chat.current.draft).toBe("draft");
  expect(chat.current.block?.code).toBe("tier_quota_exceeded");
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(chat.current.block).toBeNull();
  expect(chat.current.draft).toBe("draft");
});

it("keeps the guest draft on login and clears it when switching between accounts", async () => {
  vi.mocked(loginViaTelegram).mockResolvedValueOnce({
    ...allowance,
    tier: "internal",
    user: { id: 1, name: "one" },
  });
  const chat = mount();
  act(() => {
    chat.current.setDraft("my question");
  });
  await act(() => chat.current.login());
  expect(chat.current.draft).toBe("my question");
  act(() => {
    saveSessionAuth("other", "internal", { id: 2, name: "two" });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_user" }));
  });
  expect(chat.current.draft).toBe("");
});

it("keeps the pending answer on its original page and starts a fresh chat on another", async () => {
  const view = renderHook(() => ({ chat: useChat(), go: useNavigate() }), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  }).result;
  act(() => {
    view.current.chat.toggle();
  });
  await act(() => view.current.chat.send("Первый вопрос"));
  const call = vi.mocked(openChatMessageStream).mock.calls[0];
  if (call === undefined) {
    throw new Error("missing stream");
  }
  expect(call[1]).toMatchObject({ course: "", docId: "" });
  act(() => {
    call[2].onMeta({
      assistantMessageId: "a",
      userMessageId: "u",
      threadId: "t",
      threadTitle: "Первый вопрос",
      runId: "r",
      degraded: { active: false },
    });
    call[2].onTitle("t", "Индукция");
  });
  await act(async () => {
    await view.current.go("/algebra");
  });
  expect(view.current.chat.isStreaming).toBe(true);
  expect(view.current.chat.threads[0]?.generatedTitle).toBe("Индукция");
  act(() => {
    call[2].onDone({
      runId: "r",
      status: "done",
      text: "Ответ",
      steps: [],
      degraded: { active: false },
      block: null,
    });
  });
  await act(() => view.current.chat.send("А здесь?"));
  expect(vi.mocked(openChatMessageStream).mock.calls[1]?.[1]).toMatchObject({
    threadId: null,
    course: "algebra",
    docId: "",
  });
  expect(view.current.chat.messages[0]?.page).toEqual({ course: "algebra", docId: "" });
  expect(localStorage.getItem("hse_chat_thread:guest:/")).toBe("t");
});

it("loads the next history page without replacing the open thread", async () => {
  saveBrowserToken("browser");
  const first = thread("z");
  vi.mocked(fetchChatThread)
    .mockResolvedValueOnce({ ...first, hasMore: true })
    .mockResolvedValueOnce({ ...thread("a"), thread: null, hasMore: false });
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  await act(() => chat.current.loadMore());
  expect(fetchChatThread).toHaveBeenLastCalledWith(null, first.threads[0]);
  expect(chat.current.threads.map((item) => item.id)).toEqual(["z", "a"]);
  expect(chat.current.activeThreadId).toBeNull();
  expect(chat.current.hasMore).toBe(false);
});

it("remembers the history selection per page across reloads and forgets it for a new chat", async () => {
  saveBrowserToken("browser");
  vi.mocked(fetchChatThread).mockImplementation((id) => Promise.resolve(thread(id ?? "latest")));
  const first = mount();
  await act(async () => {
    first.current.toggle();
    await Promise.resolve();
  });
  expect(first.current.activeThreadId).toBeNull();
  await act(async () => {
    first.current.selectThread("chosen");
    await Promise.resolve();
  });
  expect(first.current.activeThreadId).toBe("chosen");
  const second = mount();
  await act(async () => {
    second.current.toggle();
    await Promise.resolve();
  });
  expect(second.current.activeThreadId).toBe("chosen");
  act(() => {
    second.current.newChat();
  });
  expect(localStorage.getItem("hse_chat_thread:guest:/")).toBeNull();
});
