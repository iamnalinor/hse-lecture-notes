import { afterEach, expect, it, vi } from "vitest";

import { openChatMessageStream } from "#web/api/chat/stream.ts";

import { seedChatAuth } from "../../support/chat-auth.ts";

afterEach(() => vi.unstubAllGlobals());

const params = {
  allowanceToken: "a",
  browserToken: "b",
  clientRequestId: "q",
  course: "",
  docId: "",
  text: "q",
  threadId: "t",
  quote: null,
};
const meta = {
  type: "meta",
  threadId: "t",
  runId: "r",
  assistantMessageId: "a",
  userMessageId: "u",
  threadTitle: "T",
  degraded: { active: false },
};
const done = {
  type: "done",
  runId: "r",
  status: "done",
  text: "Ответ",
  steps: [],
  block: null,
  degraded: { active: false },
};
const callbacks = () => ({
  onMeta: vi.fn(),
  onDone: vi.fn(),
  onTitle: vi.fn(),
  onDelta: vi.fn(),
  onStep: vi.fn(),
  onStopError: vi.fn(),
  onError: vi.fn(),
  onCloseUnexpected: vi.fn(),
});
const api = "https://api.example";
const encoder = new TextEncoder();
const lines = (...frames: readonly unknown[]) =>
  `${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`;

const start = () => {
  const transport = new TransformStream<Uint8Array, Uint8Array>();
  const writer = transport.writable.getWriter();
  const post = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(transport.readable))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", post);
  const listeners = callbacks();
  const stream = openChatMessageStream(api, params, listeners);
  const write = async (...frames: readonly unknown[]) => {
    await writer.write(encoder.encode(lines(...frames)));
  };
  return { listeners, post, stream, writer, write };
};

it("posts one send and reads NDJSON across split UTF-8 and frame boundaries", async () => {
  const { listeners, post, write, writer } = start();
  expect(post).toHaveBeenCalledExactlyOnceWith(
    `${api}/v1/messages`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ...params, type: "send" }),
      credentials: "omit",
      redirect: "error",
    }),
  );
  await write({ ...meta, contextLimited: "yes" }, { type: "heartbeat" });
  const delta = encoder.encode(lines({ type: "delta", text: "Я" }));
  const split = delta.indexOf(0xd0) + 1;
  await writer.write(delta.slice(0, split));
  expect(listeners.onDelta).not.toHaveBeenCalled();
  await writer.write(delta.slice(split));
  await write({ type: "title", threadId: "other", title: "Wrong" }, { ...done, runId: "other" });
  expect(listeners.onDone).not.toHaveBeenCalled();
  expect(listeners.onTitle).not.toHaveBeenCalled();
  await write(
    { ...done, suggestion: { bad: true }, contextLimited: 1 },
    { type: "delta", text: "late" },
  );
  await vi.waitFor(() => {
    expect(listeners.onDone).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ suggestion: null, contextLimited: false }),
    );
  });
  expect(listeners.onDelta).toHaveBeenCalledExactlyOnceWith("Я");
});

it("queues stop before meta, authenticates it once, and keeps reading until stopped done", async () => {
  seedChatAuth({ browserToken: "b", sessionToken: "session" });
  try {
    const { listeners, post, stream, write } = start();
    stream.stop();
    stream.stop();
    expect(post).toHaveBeenCalledTimes(1);
    await write(meta, { type: "delta", text: "Часть" });
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2);
    });
    const [url, init] = post.mock.calls[1] ?? [];
    expect(url).toBe(`${api}/v1/runs/r/stop`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Browser-Token")).toBe("b");
    expect(new Headers(init?.headers).get("X-Session-Token")).toBe("session");
    stream.stop();
    await write({ ...done, status: "stopped" });
    await vi.waitFor(() => {
      expect(listeners.onDone).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: "stopped" }),
      );
    });
    expect(listeners.onDelta).toHaveBeenCalledExactlyOnceWith("Часть");
    expect(post).toHaveBeenCalledTimes(2);
  } finally {
    localStorage.removeItem("hse_chat_auth");
  }
});

it("detaches without sending stop or delivering later callbacks", async () => {
  const { listeners, post, stream, write } = start();
  await write(meta);
  await vi.waitFor(() => {
    expect(listeners.onMeta).toHaveBeenCalledOnce();
  });
  stream.disconnect();
  expect(post).toHaveBeenCalledTimes(1);
  expect(listeners.onCloseUnexpected).not.toHaveBeenCalled();
  expect(listeners.onDone).not.toHaveBeenCalled();
});

it.each([
  { code: "question_too_long", message: "Сократи вопрос." },
  {
    code: "rate_limited",
    message: "Подожди.",
    block: { code: "rate_limited", retryAfterSec: 4 },
    retryAfterSec: 4,
  },
])("propagates the structured HTTP admission error $code", async (payload) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ type: "error", ...payload }, { status: 400 })),
  );
  const listeners = callbacks();
  openChatMessageStream(api, params, listeners);
  await vi.waitFor(() => {
    expect(listeners.onError).toHaveBeenCalledExactlyOnceWith(payload);
  });
  expect(listeners.onCloseUnexpected).not.toHaveBeenCalled();
});

it("honors an explicit stop after detach without delivering the hidden result", async () => {
  const { listeners, post, stream, write } = start();
  stream.stop();
  stream.disconnect();
  expect(post).toHaveBeenCalledTimes(1);
  await write(meta);
  await vi.waitFor(() => {
    expect(post).toHaveBeenCalledTimes(2);
  });
  expect(post.mock.calls[1]?.[0]).toBe(`${api}/v1/runs/r/stop`);
  expect(listeners.onMeta).not.toHaveBeenCalled();
  expect(listeners.onCloseUnexpected).not.toHaveBeenCalled();
});

it("delivers the server's terminal error from a successful stream", async () => {
  const { listeners, write } = start();
  const error = { code: "error", message: "Текст ошибки сервера." };
  await write(meta, { type: "error", ...error }, done);
  await vi.waitFor(() => {
    expect(listeners.onError).toHaveBeenCalledExactlyOnceWith(error);
  });
  expect(listeners.onDone).not.toHaveBeenCalled();
});

it.each([
  "null",
  JSON.stringify({ ...meta, degraded: undefined }),
  JSON.stringify({ type: "step", steps: [{ kind: "search", state: "done", links: [123] }] }),
])("reports an incompatible frame once: %s", async (data) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${data}\n`)));
  const listeners = callbacks();
  openChatMessageStream(api, params, listeners);
  await vi.waitFor(() => {
    expect(listeners.onError).toHaveBeenCalledExactlyOnceWith({
      code: "invalid_frame",
      message: "Не удалось прочитать ответ сервера. Попробуй еще раз.",
    });
  });
  expect(listeners.onCloseUnexpected).not.toHaveBeenCalled();
});

it("reports an unconfirmed EOF and preserves the last complete frame without a newline", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(meta)));
  const listeners = callbacks();
  openChatMessageStream(api, params, listeners);
  await vi.waitFor(() => {
    expect(listeners.onCloseUnexpected).toHaveBeenCalledOnce();
  });
  expect(listeners.onMeta).toHaveBeenCalledOnce();
});

it.each([
  [502, "<h1>Bad gateway</h1>"],
  [504, ""],
  [200, ""],
] as const)(
  "recovers an unconfirmed HTTP %s through the lost-response path",
  async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    const listeners = callbacks();
    openChatMessageStream(api, params, listeners);
    await vi.waitFor(() => {
      expect(listeners.onCloseUnexpected).toHaveBeenCalledOnce();
    });
    expect(listeners.onError).not.toHaveBeenCalled();
  },
);

it("retries a stop timeout once after detach without reporting it to the next thread", async () => {
  const { post, stream, write, listeners } = start();
  await write(meta);
  await vi.waitFor(() => {
    expect(listeners.onMeta).toHaveBeenCalledOnce();
  });
  post
    .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  stream.stop();
  stream.disconnect();
  await vi.waitFor(() => {
    expect(post).toHaveBeenCalledTimes(3);
  });
  expect(listeners.onStopError).not.toHaveBeenCalled();
});

it("leaves a permanent stop refusal retryable and suppresses a late error after done", async () => {
  const { post, stream, write, listeners } = start();
  await write(meta);
  await vi.waitFor(() => {
    expect(listeners.onMeta).toHaveBeenCalledOnce();
  });
  post.mockResolvedValueOnce(new Response(null, { status: 403 }));
  stream.stop();
  await vi.waitFor(() => {
    expect(listeners.onStopError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Не удалось остановить ответ"),
    );
  });
  expect(post).toHaveBeenCalledTimes(2);
  const late = Promise.withResolvers<Response>();
  post.mockReturnValueOnce(late.promise);
  stream.stop();
  await write(done);
  await vi.waitFor(() => {
    expect(listeners.onDone).toHaveBeenCalledOnce();
  });
  late.resolve(new Response(null, { status: 403 }));
  await late.promise;
  expect(listeners.onStopError).toHaveBeenCalledTimes(1);
});
