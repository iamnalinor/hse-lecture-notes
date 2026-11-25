import { expect, it, vi } from "vitest";

import { openChatMessageStream, type WsStreamCallbacks } from "#web/api/chat/stream.ts";

it("ignores frames for another run and sanitizes malformed metadata fields", () => {
  const socket = new EventTarget();
  vi.stubGlobal(
    "WebSocket",
    vi.fn(function createSocket() {
      return socket;
    }),
  );
  const callbacks: WsStreamCallbacks = {
    onMeta: vi.fn(),
    onDone: vi.fn(),
    onTitle: vi.fn(),
    onDelta: vi.fn(),
    onStep: vi.fn(),
    onError: vi.fn(),
    onCloseUnexpected: vi.fn(),
  };
  openChatMessageStream(
    "https://api.example",
    {
      allowanceToken: "a",
      browserToken: "b",
      clientRequestId: "q",
      course: "",
      docId: "",
      text: "q",
      threadId: "t",
      quote: null,
    },
    callbacks,
  );
  const frame = (data: unknown): void => {
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  };
  frame({
    type: "meta",
    threadId: "t",
    runId: "r",
    assistantMessageId: "a",
    userMessageId: "u",
    threadTitle: "T",
    contextLimited: "yes",
    degraded: { active: false },
  });
  frame({ type: "heartbeat", received: true });
  frame({ type: "title", threadId: "other", title: "Wrong" });
  frame({
    type: "done",
    runId: "other",
    status: "done",
    text: "Wrong",
    steps: [],
    degraded: { active: false },
    block: null,
  });
  expect(callbacks.onDone).not.toHaveBeenCalled();
  expect(callbacks.onTitle).not.toHaveBeenCalled();
  frame({
    type: "done",
    runId: "r",
    status: "done",
    text: "Answer",
    steps: [],
    degraded: { active: false },
    block: null,
    suggestion: { bad: true },
    contextLimited: 1,
  });
  expect(callbacks.onDone).toHaveBeenCalledWith(
    expect.objectContaining({ suggestion: null, contextLimited: false }),
  );
  frame({ type: "delta", text: "late" });
  expect(callbacks.onDelta).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each([
  [
    '{"type":"error","code":"invalid_frame","message":"Не удалось прочитать цитату."}',
    "Не удалось прочитать цитату.",
  ],
  ["null", "Не удалось прочитать ответ сервера. Попробуй еще раз."],
  [
    JSON.stringify({
      type: "meta",
      threadId: "t",
      runId: "r",
      assistantMessageId: "a",
      userMessageId: "u",
      threadTitle: "T",
    }),
    "Не удалось прочитать ответ сервера. Попробуй еще раз.",
  ],
  [
    JSON.stringify({ type: "step", steps: [{ kind: "search", state: "done", links: [123] }] }),
    "Не удалось прочитать ответ сервера. Попробуй еще раз.",
  ],
])("reports an unreadable message once, without a second connection error", (data, message) => {
  const socket = Object.assign(new EventTarget(), { close: vi.fn() });
  vi.stubGlobal(
    "WebSocket",
    vi.fn(function () {
      return socket;
    }),
  );
  try {
    const callbacks = {
      onMeta: vi.fn(),
      onDelta: vi.fn(),
      onStep: vi.fn(),
      onError: vi.fn(),
      onCloseUnexpected: vi.fn(),
      onDone: vi.fn(),
      onTitle: vi.fn(),
    };
    openChatMessageStream(
      "https://api.example",
      {
        allowanceToken: "a",
        browserToken: "b",
        clientRequestId: "q",
        course: "",
        docId: "",
        text: "q",
        threadId: null,
        quote: null,
      },
      callbacks,
    );
    socket.dispatchEvent(new MessageEvent("message", { data }));
    socket.dispatchEvent(new Event("close"));
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith({ code: "invalid_frame", message });
    expect(callbacks.onCloseUnexpected).not.toHaveBeenCalled();
    expect(callbacks.onMeta).not.toHaveBeenCalled();
    expect(callbacks.onStep).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
