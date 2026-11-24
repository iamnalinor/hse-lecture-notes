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
import { saveBrowserToken, saveDegraded, saveSessionAuth } from "#web/api/chat-storage.ts";
import { type ActiveWsStream, openChatMessageStream } from "#web/api/chat-stream.ts";

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

it("detaches an active response for a new chat and ignores its late events", async () => {
  const chat = mount();
  await act(() => chat.current.send("first"));
  const first = vi.mocked(openChatMessageStream).mock.calls[0]?.[2];
  const connection = vi.mocked(openChatMessageStream).mock.results[0]?.value as
    | ActiveWsStream
    | undefined;
  act(() =>
    first?.onMeta({
      assistantMessageId: "a",
      userMessageId: "u",
      runId: "r",
      threadId: "t",
      threadTitle: "first",
      degraded: { active: false },
    }),
  );
  act(() => {
    chat.current.newChat();
  });
  expect(connection?.disconnect).toHaveBeenCalledOnce();
  expect(connection?.stop).not.toHaveBeenCalled();
  expect(chat.current.activeThreadId).toBeNull();
  expect(chat.current.isStreaming).toBe(false);
  expect(chat.current.messages).toHaveLength(0);
  await act(() => chat.current.send("second"));
  act(() => {
    first?.onDelta("old answer");
    first?.onDone({
      runId: "r",
      text: "old answer",
      status: "done",
      steps: [],
      block: null,
      degraded: { active: false },
    });
  });
  expect(chat.current.messages.at(-1)?.contentTex).toBe("");
  expect(chat.current.isStreaming).toBe(true);
  expect(vi.mocked(openChatMessageStream).mock.calls[1]?.[1]).toMatchObject({
    threadId: null,
    text: "second",
  });
});

it("can select history during a restored background response without its poll replacing the selection", async () => {
  vi.useFakeTimers();
  saveBrowserToken("browser");
  localStorage.setItem("hse_chat_thread:guest:/", "running");
  const answer = { ...makeAssistantMsg({ course: "", docId: "" }), id: "a", runId: "r" };
  const status = Promise.withResolvers<Awaited<ReturnType<typeof fetchChatRunStatus>>>();
  vi.mocked(fetchChatRunStatus).mockReturnValueOnce(status.promise);
  vi.mocked(fetchChatThread)
    .mockResolvedValueOnce(thread("running", [answer]))
    .mockResolvedValueOnce(thread("other"));
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  expect(chat.current.isStreaming).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(1500));
  await act(async () => {
    chat.current.selectThread("other");
    await Promise.resolve();
  });
  expect(chat.current.activeThreadId).toBe("other");
  expect(chat.current.isStreaming).toBe(false);
  await act(async () => {
    status.resolve({
      runId: "r",
      threadId: "running",
      assistantMessageId: "a",
      status: "done",
      expiresAt: 1000,
    });
    await Promise.resolve();
  });
  expect(chat.current.activeThreadId).toBe("other");
  expect(fetchChatThread).toHaveBeenCalledTimes(2);
});

it("does not let a detached allowance request overwrite the next chat or its checking status", async () => {
  const pending = Promise.withResolvers<typeof allowance>();
  vi.mocked(ensureChatAllowance).mockImplementationOnce((_hooks, options) => {
    options?.onChecking?.();
    return pending.promise;
  });
  const chat = mount();
  let sending: Promise<void> | undefined;
  act(() => {
    sending = chat.current.send("first");
  });
  act(() => {
    chat.current.newChat();
  });
  expect(chat.current.isCheckingBrowser).toBe(false);
  await act(() => chat.current.send("second"));
  await act(async () => {
    pending.resolve(allowance);
    await sending;
  });
  expect(chat.current.messages[0]?.contentTex).toBe("second");
  expect(chat.current.isStreaming).toBe(true);
  expect(openChatMessageStream).toHaveBeenCalledOnce();
});

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
  saveSessionAuth("account1", "student", { id: 1, name: "one" });
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
    saveSessionAuth("account2", "student", { id: 2, name: "two" });
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

it("restores a refused retry without losing the saved answer", async () => {
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

it("retains the degraded caption while a cached allowance starts the next turn", async () => {
  const chat = mount();
  const degraded = { active: true, restoresAt: Date.now() + 60_000 };
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, degraded });
  await act(() => chat.current.send("first"));
  act(() =>
    vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onDone({
      degraded,
      block: null,
      runId: "r",
      status: "done",
      steps: [],
      text: "answer",
    }),
  );
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, degraded: null });
  await act(() => chat.current.send("second"));
  expect(chat.current.degraded).toEqual(degraded);
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

it.each(["allowance", "websocket"])(
  "keeps an unsent question visible after a %s quota refusal and Telegram login",
  async (stage) => {
    const blocked = { code: "auth_required" } as const;
    if (stage === "allowance") {
      vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, block: blocked });
    }
    const chat = mount();
    await act(() => chat.current.send("Мой вопрос"));
    if (stage === "websocket") {
      act(() =>
        vi
          .mocked(openChatMessageStream)
          .mock.calls[0]?.[2].onError({ code: "auth_required", message: "limit", block: blocked }),
      );
    }
    expect(chat.current.messages).toHaveLength(1);
    expect(chat.current.messages[0]).toMatchObject({
      role: "user",
      contentTex: "Мой вопрос",
      status: "error",
    });
    expect(chat.current.isStreaming).toBe(false);
    expect(chat.current.draft).toBe("Мой вопрос");
    vi.mocked(loginViaTelegram).mockResolvedValueOnce({
      ...allowance,
      tier: "student",
      user: { id: 1, name: "one" },
    });
    await act(() => chat.current.login());
    expect(chat.current.messages[0]?.contentTex).toBe("Мой вопрос");
    expect(chat.current.draft).toBe("Мой вопрос");
    vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
      ...allowance,
      tier: "student",
      user: { id: 1, name: "one" },
    });
    await act(() => chat.current.send());
    expect(chat.current.messages.filter((m) => m.role === "user")).toHaveLength(1);
  },
);

it("keeps the guest draft on login and clears it when switching between accounts", async () => {
  vi.mocked(loginViaTelegram).mockResolvedValueOnce({
    ...allowance,
    tier: "student",
    user: { id: 1, name: "one" },
  });
  const chat = mount();
  const host = document.querySelector("#hse-turnstile-host");
  const iframe = document.createElement("iframe");
  host?.append(iframe);
  act(() => {
    chat.current.setDraft("my question");
  });
  await act(() => chat.current.login());
  expect(document.querySelector("#hse-turnstile-host")).toBe(host);
  expect(host?.firstChild).toBe(iframe);
  expect(chat.current.draft).toBe("my question");
  act(() => {
    saveSessionAuth("other", "student", { id: 2, name: "two" });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_user" }));
  });
  expect(chat.current.draft).toBe("");
});

it("keeps the open conversation visible across navigation, including after streaming finishes", async () => {
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
    threadId: "t",
    course: "algebra",
    docId: "",
  });
  expect(view.current.chat.messages).toHaveLength(4);
  expect(view.current.chat.messages[0]?.page).toEqual({ course: "", docId: "" });
  expect(view.current.chat.isOpen).toBe(true);
  expect(document.documentElement).toHaveClass("ai-open");
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

it("preserves a loaded conversation while open and restores the new page after reopening", async () => {
  saveBrowserToken("browser");
  localStorage.setItem("hse_chat_thread:guest:/", "home-thread");
  localStorage.setItem("hse_chat_thread:guest:/algebra", "algebra-thread");
  vi.mocked(fetchChatThread).mockImplementation((id) =>
    Promise.resolve(
      thread(id ?? "unused", [
        { ...makeAssistantMsg({ course: "", docId: "" }), status: "done", contentTex: id ?? "" },
      ]),
    ),
  );
  const { result } = renderHook(() => ({ chat: useChat(), go: useNavigate() }), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  });
  await act(async () => {
    result.current.chat.toggle();
    await Promise.resolve();
  });
  expect(result.current.chat.activeThreadId).toBe("home-thread");
  const messages = result.current.chat.messages;
  await act(async () => {
    await result.current.go("/algebra");
  });
  expect(result.current.chat.messages).toBe(messages);
  expect(result.current.chat.activeThreadId).toBe("home-thread");
  expect(result.current.chat.isOpen).toBe(true);
  expect(document.documentElement).toHaveClass("ai-open");
  expect(fetchChatThread).toHaveBeenCalledOnce();
  act(() => {
    result.current.chat.close();
  });
  await act(async () => {
    result.current.chat.toggle();
    await Promise.resolve();
  });
  expect(result.current.chat.activeThreadId).toBe("algebra-thread");
});

it("tracks loading while restoring or selecting a conversation and clears it on failure", async () => {
  saveBrowserToken("browser");
  localStorage.setItem("hse_chat_thread:guest:/", "saved");
  const restored = Promise.withResolvers<ThreadResponse>();
  const selected = Promise.withResolvers<ThreadResponse>();
  vi.mocked(fetchChatThread)
    .mockReturnValueOnce(restored.promise)
    .mockReturnValueOnce(selected.promise);
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  expect(chat.current.isThreadLoading).toBe(true);
  await act(async () => {
    restored.resolve(thread("saved"));
    await Promise.resolve();
  });
  expect(chat.current.isThreadLoading).toBe(false);
  act(() => {
    chat.current.selectThread("chosen");
  });
  expect(chat.current.isThreadLoading).toBe(true);
  await act(async () => {
    selected.reject(new Error("offline"));
    await Promise.resolve();
  });
  expect(chat.current.isThreadLoading).toBe(false);
  expect(chat.current.activeThreadId).toBe("saved");
});

it("shows local browser verification only for a sent message that needs allowance", async () => {
  const pending = Promise.withResolvers<typeof allowance>();
  vi.mocked(ensureChatAllowance).mockImplementationOnce((_hooks, options) => {
    options?.onChecking?.();
    return pending.promise;
  });
  const chat = mount();
  expect(chat.current.isCheckingBrowser).toBe(false);
  let sending: Promise<void> | undefined;
  act(() => {
    sending = chat.current.send("question");
  });
  expect(chat.current.isCheckingBrowser).toBe(true);
  expect(chat.current.messages.at(-1)?.status).toBe("running");
  await act(async () => {
    pending.resolve(allowance);
    await sending;
  });
  expect(chat.current.isCheckingBrowser).toBe(false);
  expect(openChatMessageStream).toHaveBeenCalledOnce();
});

it("clears a cancelled history selection when closed and can reopen the loaded conversation", async () => {
  saveBrowserToken("browser");
  localStorage.setItem("hse_chat_thread:guest:/", "saved");
  const selected = Promise.withResolvers<ThreadResponse>();
  vi.mocked(fetchChatThread)
    .mockResolvedValueOnce(thread("saved"))
    .mockReturnValueOnce(selected.promise);
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  expect(chat.current.activeThreadId).toBe("saved");
  act(() => {
    chat.current.selectThread("chosen");
  });
  expect(chat.current.isThreadLoading).toBe(true);
  act(() => {
    chat.current.close();
  });
  expect(chat.current.isThreadLoading).toBe(false);
  await act(async () => {
    chat.current.toggle();
    selected.resolve(thread("chosen"));
    await Promise.resolve();
  });
  expect(chat.current.isThreadLoading).toBe(false);
  expect(chat.current.activeThreadId).toBe("saved");
  await act(() => chat.current.send("next"));
  expect(openChatMessageStream).toHaveBeenCalledOnce();
});

it("clears browser verification and restores the draft when a pre-stream request is stopped", async () => {
  vi.mocked(ensureChatAllowance).mockImplementationOnce(async (_hooks, options) => {
    options?.onChecking?.();
    return await new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        "abort",
        () => {
          reject(new Error("stopped"));
        },
        { once: true },
      );
    });
  });
  const chat = mount();
  let sending: Promise<void> | undefined;
  act(() => {
    sending = chat.current.send("draft");
  });
  expect(chat.current.isCheckingBrowser).toBe(true);
  await act(async () => {
    chat.current.stop();
    await sending;
  });
  expect(chat.current.isCheckingBrowser).toBe(false);
  expect(chat.current.isStreaming).toBe(false);
  expect(chat.current.draft).toBe("draft");
  expect(chat.current.messages).toHaveLength(0);
  expect(openChatMessageStream).not.toHaveBeenCalled();
});

it("shows the already known degraded quota immediately and keeps it scoped to the account", () => {
  const degraded = { active: true, restoresAt: Date.now() + 120_000 };
  saveSessionAuth("one", "student", { id: 1, name: "one" });
  saveDegraded(degraded);
  const first = mount();
  expect(first.current.degraded).toEqual(degraded);
  expect(ensureChatAllowance).not.toHaveBeenCalled();
  saveSessionAuth("two", "student", { id: 2, name: "two" });
  const second = mount();
  expect(second.current.degraded).toEqual({ active: false });
});
