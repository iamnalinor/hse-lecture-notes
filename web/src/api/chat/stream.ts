import {
  type ChatBlock,
  type ChatDegraded,
  type ChatMessageStatus,
  type ChatQuote,
  type ChatStep,
  parseChatSuggestion,
} from "#web/domain/chat/model.ts";

export type WsStreamCallbacks = {
  readonly onTitle: (threadId: string, title: string) => void;
  readonly onCloseUnexpected: () => void;
  /** The user stopped before the socket opened: nothing reached the server. */
  readonly onCancelledBeforeStart?: () => void;
  readonly onDelta: (text: string) => void;
  readonly onDone: (payload: {
    readonly errorMessage?: null | string;
    readonly replayed?: boolean;
    readonly contextLimited?: boolean;
    readonly suggestion?: null | string;
    readonly block: ChatBlock | null;
    readonly degraded: ChatDegraded;
    readonly runId: string;
    readonly status: ChatMessageStatus;
    readonly steps: readonly ChatStep[];
    readonly text: string;
  }) => void;
  readonly onError: (payload: {
    readonly block?: ChatBlock | null;
    readonly code: string;
    readonly message: string;
  }) => void;
  readonly onMeta: (payload: {
    readonly replayed?: boolean;
    readonly contextLimited?: boolean;
    readonly suggestion?: null | string;
    readonly assistantMessageId: string;
    readonly degraded: ChatDegraded;
    readonly runId: string;
    readonly threadId: string;
    readonly generatedTitle?: null | string;
    readonly threadTitle: string;
    readonly userMessageId: string;
  }) => void;
  readonly onStep: (steps: readonly ChatStep[]) => void;
};

export type ActiveWsStream = {
  readonly disconnect: () => void;
  readonly stop: () => void;
};

export type SendWsParams = {
  readonly allowanceToken: string;
  readonly browserToken: string;
  readonly clientRequestId: string;
  readonly course: string;
  readonly docId: string;
  readonly quote: ChatQuote | null;
  readonly retryAssistantMessageId?: null | string;
  readonly text: string;
  readonly threadId: null | string;
};

const toWsUrl = (httpUrl: string): string => httpUrl.replace(/^http/, "ws");

const parseFrame = (raw: string): null | Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

type StreamIdentity = { readonly threadId: null | string; readonly runId: null | string };
const isMatchingIdentity = (frame: Record<string, unknown>, identity: StreamIdentity): boolean => {
  if (frame["type"] === "meta") {
    const isValid = [
      "threadId",
      "runId",
      "assistantMessageId",
      "userMessageId",
      "threadTitle",
    ].every((field) => typeof frame[field] === "string");
    return (
      isValid &&
      (identity.threadId === null || frame["threadId"] === identity.threadId) &&
      (identity.runId === null || frame["runId"] === identity.runId)
    );
  }
  return frame["type"] === "title"
    ? frame["threadId"] === identity.threadId
    : frame["type"] !== "done" || frame["runId"] === identity.runId;
};

const deliverDone = (parsed: Record<string, unknown>, callbacks: WsStreamCallbacks): void => {
  callbacks.onDone({
    ...parsed,
    errorMessage: typeof parsed["errorMessage"] === "string" ? parsed["errorMessage"] : null,
    suggestion: parseChatSuggestion(parsed["suggestion"]),
    contextLimited: parsed["contextLimited"] === true,
    text: typeof parsed["text"] === "string" ? parsed["text"] : "",
    steps: Array.isArray(parsed["steps"]) ? parsed["steps"] : [],
  } as unknown as Parameters<WsStreamCallbacks["onDone"]>[0]);
};

const deliverMeta = (parsed: Record<string, unknown>, callbacks: WsStreamCallbacks): void => {
  if (typeof parsed["threadId"] !== "string" || typeof parsed["runId"] !== "string") {
    return;
  }
  callbacks.onMeta({
    ...parsed,
    contextLimited: parsed["contextLimited"] === true,
  } as unknown as Parameters<WsStreamCallbacks["onMeta"]>[0]);
};

const deliverTitle = (parsed: Record<string, unknown>, callbacks: WsStreamCallbacks): void => {
  const title = parsed["title"];
  const threadId = parsed["threadId"];
  if (typeof threadId !== "string" || typeof title !== "string") {
    return;
  }
  if ((title.match(/./gsu)?.length ?? 0) <= 48) {
    callbacks.onTitle(threadId, title);
  }
};

const deliverError = (parsed: Record<string, unknown>, callbacks: WsStreamCallbacks): void => {
  callbacks.onError({
    code: typeof parsed["code"] === "string" ? parsed["code"] : "invalid_frame",
    message:
      typeof parsed["message"] === "string" && parsed["message"].trim() !== ""
        ? parsed["message"]
        : "Не удалось прочитать ответ сервера. Попробуй еще раз.",
    ...(parsed["block"] !== null &&
      typeof parsed["block"] === "object" &&
      "code" in parsed["block"] &&
      typeof parsed["block"].code === "string" && { block: parsed["block"] as ChatBlock }),
  });
};

const isTerminalWsFrame = (
  parsed: Record<string, unknown>,
  callbacks: WsStreamCallbacks,
): boolean => {
  switch (parsed["type"]) {
    case "meta": {
      deliverMeta(parsed, callbacks);
      return false;
    }
    case "title": {
      deliverTitle(parsed, callbacks);
      return false;
    }
    case "step": {
      callbacks.onStep(Array.isArray(parsed["steps"]) ? (parsed["steps"] as ChatStep[]) : []);
      return false;
    }
    case "delta": {
      if (typeof parsed["text"] === "string") {
        callbacks.onDelta(parsed["text"]);
      }
      return false;
    }
    case "done": {
      deliverDone(parsed, callbacks);
      return true;
    }
    case "error": {
      deliverError(parsed, callbacks);
      return true;
    }
    default: {
      return false;
    }
  }
};

export const openChatMessageStream = (
  apiUrl: string,
  params: SendWsParams,
  callbacks: WsStreamCallbacks,
): ActiveWsStream => {
  const ws = new WebSocket(`${toWsUrl(apiUrl)}/v1/messages`);
  let isFinished = false;
  let isCancelledBeforeStart = false;
  let identity: StreamIdentity = { threadId: params.threadId, runId: null };

  ws.addEventListener("open", () => {
    if (!isFinished) {
      ws.send(JSON.stringify({ ...params, type: "send" }));
    }
  });

  ws.addEventListener("message", (event) => {
    if (isFinished) {
      return;
    }
    const parsed = typeof event.data === "string" ? parseFrame(event.data) : null;
    if (parsed === null) {
      isFinished = true;
      callbacks.onError({
        code: "invalid_frame",
        message: "Не удалось прочитать ответ сервера. Попробуй еще раз.",
      });
      ws.close();
      return;
    }
    if (!isMatchingIdentity(parsed, identity)) {
      return;
    }
    if (parsed["type"] === "meta") {
      identity = { threadId: parsed["threadId"] as string, runId: parsed["runId"] as string };
    }
    if (isTerminalWsFrame(parsed, callbacks)) {
      isFinished = true;
    }
  });

  ws.addEventListener("close", () => {
    if (isCancelledBeforeStart && !isFinished) {
      isFinished = true;
      callbacks.onCancelledBeforeStart?.();
      return;
    }
    if (!isFinished) {
      callbacks.onCloseUnexpected();
    }
  });

  return {
    disconnect: () => {
      isFinished = true;
      ws.close();
    },
    stop: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
      } else if (ws.readyState === WebSocket.CONNECTING) {
        isCancelledBeforeStart = true;
        ws.close();
      }
    },
  };
};
