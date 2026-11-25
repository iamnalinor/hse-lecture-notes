import type { ReactNode } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ChatMessage } from "#web/domain/chat/model.ts";

import { TelegramLoginCancelled } from "#web/api/chat/abort.ts";
import {
  ensureChatAllowance,
  fetchChatRunStatus,
  fetchChatThread,
  loginViaTelegram,
  type ThreadResponse,
} from "#web/api/chat/client.ts";
import { readStoredAuth, saveDegraded } from "#web/api/chat/storage.ts";
import { type ActiveWsStream, openChatMessageStream } from "#web/api/chat/stream.ts";
import { cancelActiveTurnstile } from "#web/api/chat/widgets.ts";
import { ChatProvider, useChat } from "#web/shared/chat/session/context.tsx";
import { makeAssistantMsg, makeUserMsg } from "#web/shared/chat/stream/helpers.ts";

import { seedChatAuth } from "../../../support/chat-auth.ts";

vi.mock("#web/api/chat/client.ts", () => ({
  ensureChatAllowance: vi.fn(),
  fetchChatRunStatus: vi.fn(),
  fetchChatThread: vi.fn(),
  getChatEnvConfig: () => ({ apiUrl: "https://example.test" }),
  isChatConfigured: () => true,
  loginViaTelegram: vi.fn(),
}));
vi.mock("#web/api/chat/stream.ts", () => ({ openChatMessageStream: vi.fn() }));
vi.mock("#web/api/chat/widgets.ts", () => ({
  cancelActiveTurnstile: vi.fn(),
  warmupChatWidgets: vi.fn(),
  loadTelegramSdk: () => Promise.resolve(),
}));

const mount = () =>
  renderHook(() => useChat(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  }).result;

const mockLogin = (account: Awaited<ReturnType<typeof loginViaTelegram>>): void => {
  vi.mocked(loginViaTelegram).mockImplementationOnce(() => {
    seedChatAuth({ ...account, sessionToken: "session" });
    return Promise.resolve(account);
  });
};

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
  seedChatAuth({ browserToken: "browser" });
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
  await act(() => vi.advanceTimersToNextTimerAsync());
  expect(fetchChatRunStatus).toHaveBeenCalledExactlyOnceWith("r");
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
  vi.mocked(fetchChatThread).mockResolvedValue(null);
  vi.mocked(ensureChatAllowance).mockResolvedValue(allowance);
  vi.mocked(openChatMessageStream).mockReturnValue({ stop: vi.fn(), disconnect: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("discards another account's late history after a storage event", async () => {
  seedChatAuth({ browserToken: "browser" });
  seedChatAuth({ sessionToken: "account1", tier: "student", user: { id: 1, name: "one" } });
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
    seedChatAuth({ sessionToken: "account2", tier: "student", user: { id: 2, name: "two" } });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_auth" }));
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
  seedChatAuth({ browserToken: "browser" });
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

it("keeps a refused question as unsent and unlocks a quota block at its deadline", async () => {
  vi.useFakeTimers();
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "tier_quota_exceeded", nextAvailableAt: Date.now() + 1000 },
  });
  const chat = mount();
  await act(() => chat.current.send("draft"));
  // The question waits as «Не отправлено», not as a second copy in the composer.
  expect(chat.current.draft).toBe("");
  expect(chat.current.messages.at(-1)).toMatchObject({ contentTex: "draft", status: "error" });
  expect(chat.current.block?.code).toBe("tier_quota_exceeded");
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(chat.current.block).toBeNull();
  expect(chat.current.messages.at(-1)).toMatchObject({ contentTex: "draft", status: "error" });
});

it.each(["allowance", "websocket"])(
  "sends the pending question once after a %s refusal and successful login",
  async (stage) => {
    const blocked = { code: "auth_required" } as const;
    if (stage === "allowance") {
      vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, block: blocked });
    }
    const chat = mount();
    act(() => {
      chat.current.toggle();
    });
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
    expect(chat.current.draft).toBe("");
    const signedIn = { ...allowance, tier: "student" as const, user: { id: 1, name: "one" } };
    mockLogin(signedIn);
    vi.mocked(ensureChatAllowance).mockResolvedValue(signedIn);
    const previousCalls = vi.mocked(openChatMessageStream).mock.calls.length;
    await act(() => chat.current.login());
    expect(vi.mocked(openChatMessageStream).mock.calls).toHaveLength(previousCalls + 1);
    expect(chat.current.draft).toBe("");
    expect(chat.current.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(chat.current.messages[0]?.contentTex).toBe("Мой вопрос");
  },
);

it("keeps the guest draft on login and clears it when switching between accounts", async () => {
  vi.mocked(loginViaTelegram).mockResolvedValueOnce({
    ...allowance,
    tier: "student",
    user: { id: 1, name: "one" },
  });
  const chat = mount();
  act(() => {
    chat.current.toggle();
  });
  await waitFor(() => {
    expect(chat.current.isLoginBusy).toBe(false);
  });
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
    seedChatAuth({ sessionToken: "other", tier: "student", user: { id: 2, name: "two" } });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_auth" }));
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
  seedChatAuth({ browserToken: "browser" });
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
  seedChatAuth({ browserToken: "browser" });
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
  seedChatAuth({ browserToken: "browser" });
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
  seedChatAuth({ browserToken: "browser" });
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
  seedChatAuth({ browserToken: "browser" });
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
    chat.current.setDraft("следующий");
    chat.current.stop();
    await sending;
  });
  expect(chat.current.isCheckingBrowser).toBe(false);
  expect(chat.current.isStreaming).toBe(false);
  expect(chat.current.draft).toBe("следующий");
  const unsent = chat.current.messages[0];
  if (unsent === undefined) {
    throw new Error("Expected an unsent question");
  }
  expect(unsent).toMatchObject({ contentTex: "draft", status: "error" });
  expect(openChatMessageStream).not.toHaveBeenCalled();
  await act(() => chat.current.retryMessage(unsent.id));
  expect(vi.mocked(openChatMessageStream).mock.calls.at(-1)?.[1].text).toBe("draft");
  expect(chat.current.draft).toBe("следующий");
});

it("shows the already known degraded quota immediately and keeps it scoped to the account", () => {
  const degraded = { active: true, restoresAt: Date.now() + 120_000 };
  seedChatAuth({ sessionToken: "one", tier: "student", user: { id: 1, name: "one" } });
  saveDegraded(degraded);
  const first = mount();
  expect(first.current.degraded).toEqual(degraded);
  expect(ensureChatAllowance).not.toHaveBeenCalled();
  seedChatAuth({ sessionToken: "two", tier: "student", user: { id: 2, name: "two" } });
  const second = mount();
  expect(second.current.degraded).toEqual({ active: false });
});

it.each(["", "Новый черновик"])(
  "restores a context-size rejection without overwriting a newer draft: %s",
  async (newDraft) => {
    const chat = mount();
    await act(() => chat.current.send("Исходный вопрос"));
    act(() => {
      chat.current.setDraft(newDraft);
    });
    act(() =>
      vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
        code: "context_too_large",
        message: "Контекст слишком большой",
      }),
    );
    expect(chat.current.draft).toBe(newDraft === "" ? "Исходный вопрос" : newDraft);
    expect(chat.current.isStreaming).toBe(false);
    expect(chat.current.messages.at(-1)?.errorMessage).toBe("Контекст слишком большой");
  },
);

it("does not automatically send an edited pending draft after login", async () => {
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "auth_required" },
  });
  const chat = mount();
  act(() => {
    chat.current.toggle();
  });
  await act(() => chat.current.send("Старый вопрос"));
  act(() => {
    chat.current.setDraft("Новый вопрос");
  });
  const signedIn = { ...allowance, tier: "student" as const, user: { id: 1, name: "one" } };
  mockLogin(signedIn);
  vi.mocked(ensureChatAllowance).mockResolvedValue(signedIn);
  await act(() => chat.current.login());
  expect(openChatMessageStream).not.toHaveBeenCalled();
  expect(chat.current.draft).toBe("Новый вопрос");
});
it("resumes the original migrated thread after its history is restored", async () => {
  seedChatAuth({ browserToken: "browser" });
  localStorage.setItem("hse_chat_thread:guest:/", "g");
  vi.mocked(fetchChatThread).mockResolvedValue(thread("g"));
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "auth_required" },
  });
  await act(() => chat.current.send("Неотправленный вопрос"));
  const signedIn = { ...allowance, tier: "student" as const, user: { id: 1, name: "one" } };
  mockLogin(signedIn);
  vi.mocked(ensureChatAllowance).mockResolvedValue(signedIn);
  await act(async () => {
    await chat.current.login();
    await Promise.resolve();
  });
  expect(openChatMessageStream).toHaveBeenCalledOnce();
  expect(vi.mocked(openChatMessageStream).mock.calls[0]?.[1]).toMatchObject({
    threadId: "g",
    text: "Неотправленный вопрос",
  });
  expect(chat.current.draft).toBe("");
  expect(
    chat.current.messages.filter((m) => m.contentTex === "Неотправленный вопрос"),
  ).toHaveLength(1);
});

it("preserves the server failure reason in terminal events", async () => {
  const chat = mount();
  await act(() => chat.current.send("question"));
  const callbacks = vi.mocked(openChatMessageStream).mock.calls[0]?.[2];
  act(() =>
    callbacks?.onDone({
      runId: "r",
      status: "error",
      text: "",
      steps: [],
      block: null,
      degraded: { active: false },
      errorMessage: "Внутренняя ошибка сервера. Код: internal_error.",
    }),
  );
  expect(chat.current.messages.at(-1)?.errorMessage).toBe(
    "Внутренняя ошибка сервера. Код: internal_error.",
  );
});

it("does not resume an old pending question after navigation during login", async () => {
  const login = Promise.withResolvers<Awaited<ReturnType<typeof loginViaTelegram>>>();
  vi.mocked(loginViaTelegram).mockReturnValueOnce(login.promise);
  const view = renderHook(() => ({ chat: useChat(), go: useNavigate() }), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  }).result;
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "guest_budget_exceeded" },
  });
  act(() => {
    view.current.chat.toggle();
  });
  await act(() => view.current.chat.send("pending question"));
  let signingIn: Promise<void> | undefined;
  act(() => {
    signingIn = view.current.chat.login();
  });
  await act(() => view.current.go("/algebra"));
  await act(async () => {
    login.resolve({ ...allowance, tier: "student", user: { id: 7, name: "Student" } });
    await signingIn;
  });
  expect(openChatMessageStream).not.toHaveBeenCalled();
});

it.each(["allowance", "newer"])(
  "invalidates only the rejected allowance when the cache holds %s",
  async (cached) => {
    const chat = mount();
    await act(() => chat.current.send("Вопрос"));
    seedChatAuth({ allowanceToken: cached, allowanceExpiresAt: Date.now() + 3_600_000 });
    act(() =>
      vi
        .mocked(openChatMessageStream)
        .mock.calls[0]?.[2].onError({ code: "allowance_expired", message: "Разрешение истекло." }),
    );
    expect(readStoredAuth().allowanceToken).toBe(cached === "allowance" ? null : "newer");
  },
);

it("shows the signed-in account while browser verification is pending and after it fails", async () => {
  const account = { id: 4, name: "Читатель" };
  vi.mocked(loginViaTelegram).mockResolvedValueOnce({ tier: "default", user: account });
  const pending = Promise.withResolvers<typeof allowance>();
  vi.mocked(ensureChatAllowance).mockReturnValueOnce(pending.promise);
  const chat = mount();
  act(() => {
    chat.current.toggle();
  });
  await waitFor(() => {
    expect(chat.current.isLoginBusy).toBe(false);
  });
  let login: Promise<void> | undefined;
  await act(async () => {
    login = chat.current.login();
    await Promise.resolve();
  });
  expect(chat.current.user).toEqual(account);
  expect(chat.current.checkingLogin).toBe(true);
  expect(chat.current.isLoginBusy).toBe(true);
  await act(async () => {
    pending.reject(new Error("cancelled"));
    await login;
  });
  expect(chat.current.user).toEqual(account);
  expect(chat.current.checkingLogin).toBe(false);
  expect(chat.current.verificationError).toBe(true);
  expect(chat.current.isLoginBusy).toBe(false);
});

it("retries the unsent question after a rate limit with only retryAfterSec", async () => {
  vi.useFakeTimers();
  try {
    const chat = mount();
    await act(() => chat.current.send("Первый"));
    act(() => {
      chat.current.setDraft("Следующий");
      vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
        code: "rate_limited",
        message: "Подожди",
        block: { code: "rate_limited", retryAfterSec: 2 },
      });
    });
    expect(chat.current.block?.code).toBe("rate_limited");
    const unsent = chat.current.messages[0];
    if (unsent === undefined) {
      throw new Error("Expected an unsent question");
    }
    await act(() => vi.advanceTimersByTimeAsync(2001));
    expect(chat.current.block).toBeNull();
    await act(() => chat.current.retryMessage(unsent.id));
    expect(vi.mocked(openChatMessageStream).mock.calls.at(-1)?.[1].text).toBe("Первый");
    expect(chat.current.draft).toBe("Следующий");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a failed answer on screen while its retry waits for the server, then starts it on meta", async () => {
  const chat = mount();
  await act(() => chat.current.send("Q"));
  const first = vi.mocked(openChatMessageStream).mock.calls[0]?.[2];
  act(() => {
    first?.onMeta({
      assistantMessageId: "a",
      userMessageId: "u",
      runId: "r",
      threadId: "t",
      threadTitle: "title",
      degraded: { active: false },
    });
  });
  act(() => {
    first?.onError({ code: "storage_unavailable", message: "Хранилище недоступно." });
  });
  const failed = chat.current.messages.at(-1);
  expect(failed?.status).toBe("error");
  await act(() => chat.current.retryMessage("a"));
  // No flash of the running state between the click and the server's answer.
  expect(chat.current.messages.at(-1)).toMatchObject({
    status: "error",
    errorMessage: "Хранилище недоступно.",
  });
  expect(chat.current.isStreaming).toBe(true);
  const retry = vi.mocked(openChatMessageStream).mock.calls.at(-1)?.[2];
  act(() => {
    retry?.onMeta({
      assistantMessageId: "a",
      userMessageId: "u",
      runId: "r2",
      threadId: "t",
      threadTitle: "title",
      degraded: { active: false },
    });
  });
  expect(chat.current.messages.at(-1)).toMatchObject({
    status: "running",
    errorMessage: null,
    contentTex: "",
  });
});

it("discards a former account's verification after another tab switches accounts", async () => {
  const first = { sessionToken: "one", tier: "student", user: { id: 1, name: "One" } } as const;
  const second = { sessionToken: "two", tier: "extended", user: { id: 2, name: "Two" } } as const;
  vi.mocked(loginViaTelegram).mockImplementationOnce(() => {
    seedChatAuth(first);
    return Promise.resolve(first);
  });
  const verification = Promise.withResolvers<typeof allowance>();
  vi.mocked(ensureChatAllowance).mockReturnValueOnce(verification.promise);
  const chat = mount();
  act(() => {
    chat.current.toggle();
  });
  await waitFor(() => {
    expect(chat.current.isLoginBusy).toBe(false);
  });
  let login: Promise<void> | undefined;
  await act(async () => {
    login = chat.current.login();
    await Promise.resolve();
  });
  expect(chat.current.checkingLogin).toBe(true);
  act(() => {
    seedChatAuth(second);
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_auth" }));
  });
  expect(chat.current.user).toEqual(second.user);
  await act(async () => {
    verification.reject(new Error("Chat session changed"));
    await login;
  });
  expect(chat.current.verificationError).toBe(false);
  expect(chat.current.isLoginBusy).toBe(false);
});

it("does not send an old draft using credentials another tab already replaced", async () => {
  seedChatAuth({ sessionToken: "one", user: { id: 1, name: "One" }, tier: "student" });
  const chat = mount();
  act(() => {
    chat.current.setDraft("Private question");
  });
  seedChatAuth({ sessionToken: "two", user: { id: 2, name: "Two" }, tier: "extended" });
  await act(() => chat.current.send());
  expect(ensureChatAllowance).not.toHaveBeenCalled();
  expect(openChatMessageStream).not.toHaveBeenCalled();
});

it("can finish a stream after the same account renews its session", async () => {
  const user = { id: 4, name: "Reader" };
  seedChatAuth({ sessionToken: "first", user, tier: "student" });
  vi.mocked(ensureChatAllowance).mockResolvedValue({ ...allowance, user, tier: "student" });
  const chat = mount();
  await act(() => chat.current.send("First"));
  const callbacks = vi.mocked(openChatMessageStream).mock.calls[0]?.[2];
  act(() => {
    seedChatAuth({ sessionToken: "renewed" });
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "hse_chat_auth" }));
    callbacks?.onDone({
      runId: "r",
      text: "Answer",
      status: "done",
      steps: [],
      block: null,
      degraded: { active: false },
    });
  });
  expect(chat.current.messages.at(-1)?.contentTex).toBe("Answer");
  expect(chat.current.isStreaming).toBe(false);
  await act(() => chat.current.send("Second"));
  expect(openChatMessageStream).toHaveBeenCalledTimes(2);
});

it("keeps the pending retry, typed draft and quote with their original thread", async () => {
  seedChatAuth({ browserToken: "browser" });
  localStorage.setItem("hse_chat_thread:guest:/", "a");
  vi.mocked(fetchChatThread).mockImplementation((id) => Promise.resolve(thread(id ?? "empty")));
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({
    ...allowance,
    block: { code: "auth_required" },
  });
  await act(() => chat.current.send("Вопрос в A"));
  const pendingId = chat.current.messages[0]?.id ?? "";
  const quote = { label: "Ответ", messageId: "a1", tex: "Фрагмент ответа A" };
  act(() => {
    chat.current.clearBlock();
    chat.current.openWithQuote(quote);
    chat.current.setDraft("Черновик A");
  });
  await act(async () => {
    chat.current.selectThread("b");
    await Promise.resolve();
  });
  expect(chat.current.draft).toBe("");
  expect(chat.current.quote).toBeNull();
  expect(chat.current.messages).toHaveLength(0);
  await act(() => chat.current.retryMessage(pendingId));
  expect(openChatMessageStream).not.toHaveBeenCalled();
  await act(async () => {
    chat.current.selectThread("a");
    await Promise.resolve();
  });
  expect(chat.current.draft).toBe("Черновик A");
  expect(chat.current.quote).toEqual(quote);
  expect(chat.current.messages.map((msg) => msg.id)).toEqual([pendingId]);
});

it("keeps a late rejection on the original page and restores its retry on return", async () => {
  const view = renderHook(() => ({ chat: useChat(), go: useNavigate() }), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter initialEntries={["/algebra/a"]}>
        <ChatProvider>{children}</ChatProvider>
      </MemoryRouter>
    ),
  }).result;
  act(() => {
    view.current.chat.toggle();
  });
  await act(() => view.current.chat.send("Вопрос к A"));
  await act(() => view.current.go("/algebra/b"));
  act(() =>
    vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
      code: "rate_limited",
      message: "Подожди",
      block: { code: "rate_limited", retryAfterSec: 1 },
    }),
  );
  expect(view.current.chat.messages).toHaveLength(0);
  await act(() => view.current.go("/algebra/a"));
  expect(view.current.chat.messages[0]).toMatchObject({
    contentTex: "Вопрос к A",
    status: "error",
  });
});

it("shows a retryable Telegram error after a failed exchange and clears it on cancellation", async () => {
  const user = { id: 7, name: "Старый аккаунт" };
  seedChatAuth({ sessionToken: "old", tier: "default", user });
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  vi.mocked(loginViaTelegram).mockRejectedValueOnce(new Error("exchange unavailable"));
  await act(() => chat.current.switchAccount());
  expect(chat.current.loginError).toBe(true);
  expect(chat.current.user).toEqual(user);
  vi.mocked(loginViaTelegram).mockRejectedValueOnce(new TelegramLoginCancelled());
  await act(() => chat.current.switchAccount());
  expect(chat.current.loginError).toBe(false);
  expect(chat.current.user).toEqual(user);
});

it("restores the draft if a fresh allowance reduces the question limit", async () => {
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, maxQuestionChars: 10 });
  const chat = mount();
  await act(() => chat.current.send("Вопрос длиннее"));
  expect(openChatMessageStream).not.toHaveBeenCalled();
  expect(chat.current.maxQuestionChars).toBe(10);
  expect(chat.current.draft).toBe("Вопрос длиннее");
});

it.each(["close", "toggle"] as const)(
  "continues browser verification when the panel closes via %s",
  async (method) => {
    const deferred = Promise.withResolvers<typeof allowance>();
    vi.mocked(ensureChatAllowance).mockReturnValueOnce(deferred.promise);
    const chat = mount();
    act(() => {
      chat.current.toggle();
    });
    let sending: Promise<void> | undefined;
    act(() => {
      sending = chat.current.send("Вопрос");
    });
    act(() => {
      chat.current[method]();
    });
    expect(cancelActiveTurnstile).not.toHaveBeenCalled();
    expect(chat.current.isOpen).toBe(false);
    await act(async () => {
      deferred.resolve(allowance);
      await sending;
    });
    expect(openChatMessageStream).toHaveBeenCalledOnce();
  },
);

it.each(["", "Следующий вопрос"])(
  "keeps only one editable copy after a stale material quote is rejected: %s",
  async (newDraft) => {
    const chat = mount();
    const quote = { blockId: "old", label: "Определение", tex: "Старая формулировка" };
    act(() => {
      chat.current.openWithQuote(quote);
    });
    await act(() => chat.current.send("Почему так?"));
    act(() => {
      chat.current.setDraft(newDraft);
      vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
        code: "invalid_quote",
        message: "Выдели фрагмент заново.",
      });
    });
    expect(chat.current.draft).toBe(newDraft === "" ? "Почему так?" : newDraft);
    expect(chat.current.quote).toBeNull();
    expect(chat.current.draftError).toBe("Выдели фрагмент заново.");
    expect(chat.current.messages.filter((m) => m.contentTex === "Почему так?")).toHaveLength(
      newDraft === "" ? 0 : 1,
    );
  },
);

it("lets the reader edit the rejected question after sending their newer draft and receiving a real thread ID", async () => {
  const chat = mount();
  act(() => {
    chat.current.openWithQuote({ tex: "Устарело", label: "Лекция" });
  });
  await act(() => chat.current.send("Первоначальный вопрос"));
  act(() => {
    chat.current.setDraft("Следующий вопрос");
    vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
      code: "invalid_quote",
      message: "Выдели фрагмент заново.",
    });
  });
  const pending = chat.current.messages.at(-1)?.id ?? "";
  await act(() => chat.current.send());
  const second = vi.mocked(openChatMessageStream).mock.calls[1]?.[2];
  act(() => {
    second?.onMeta({
      runId: "r",
      threadId: "t",
      userMessageId: "u",
      assistantMessageId: "a",
      threadTitle: "Тема",
      degraded: { active: false },
    });
    second?.onDone({
      runId: "r",
      status: "done",
      text: "Ответ",
      block: null,
      steps: [],
      degraded: { active: false },
    });
  });
  await act(() => chat.current.retryMessage(pending));
  expect(chat.current.draft).toBe("Первоначальный вопрос");
  expect(
    chat.current.messages.filter((message) => message.contentTex === "Первоначальный вопрос"),
  ).toHaveLength(0);
});

it("uses the smaller live policy after the server rejects a cached allowance's longer question", async () => {
  seedChatAuth({
    allowanceToken: "allowance",
    allowanceExpiresAt: Date.now() + 300_000,
    maxQuestionChars: 4000,
  });
  const chat = mount();
  await act(() => chat.current.send("Длинный вопрос"));
  await act(async () => {
    vi.mocked(openChatMessageStream).mock.calls[0]?.[2].onError({
      code: "question_too_long",
      message: "Лимит изменился.",
      maxQuestionChars: 9,
    });
    await Promise.resolve();
  });
  expect(chat.current.draft).toBe("Длинный вопрос");
  expect(chat.current.maxQuestionChars).toBe(9);
  expect(readStoredAuth()).toMatchObject({ allowanceToken: null, maxQuestionChars: 9 });
  await act(() => chat.current.send());
  expect(openChatMessageStream).toHaveBeenCalledTimes(1);
});

it("regenerates a saved answer even when the original question exceeds today's input limit", async () => {
  seedChatAuth({ browserToken: "browser" });
  localStorage.setItem("hse_chat_thread:guest:/", "old");
  const page = { course: "", docId: "" };
  const original = makeUserMsg("Вопрос из старого чата", null, page);
  const answer = {
    ...makeAssistantMsg(page),
    status: "done" as const,
    runId: "saved-run",
    id: "saved-answer",
  };
  vi.mocked(fetchChatThread).mockResolvedValue(thread("old", [original, answer]));
  vi.mocked(ensureChatAllowance).mockResolvedValueOnce({ ...allowance, maxQuestionChars: 9 });
  const chat = mount();
  await act(async () => {
    chat.current.toggle();
    await Promise.resolve();
  });
  await act(() => chat.current.retryMessage("saved-answer"));
  expect(vi.mocked(openChatMessageStream).mock.calls[0]?.[1]).toMatchObject({
    threadId: "old",
    retryAssistantMessageId: "saved-answer",
  });
});

it("continues an open stream while the panel is closed and sends a stop only on request", async () => {
  const chat = mount();
  act(() => {
    chat.current.toggle();
  });
  await act(() => chat.current.send("Вопрос"));
  const stream = vi.mocked(openChatMessageStream);
  const connection = stream.mock.results[0]?.value as ActiveWsStream | undefined;
  act(() => {
    chat.current.close();
    stream.mock.calls[0]?.[2].onDelta("Ответ в фоне");
  });
  expect(chat.current.messages.at(-1)?.contentTex).toBe("Ответ в фоне");
  expect(connection?.disconnect).not.toHaveBeenCalled();
  expect(connection?.stop).not.toHaveBeenCalled();
  act(() => {
    chat.current.toggle();
  });
  act(() => {
    chat.current.stop();
  });
  expect(connection?.stop).toHaveBeenCalledOnce();
});
