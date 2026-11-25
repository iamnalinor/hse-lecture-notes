import type {
  ChatBlock,
  ChatDegraded,
  ChatMessageStatus,
  ChatQuote,
  ChatStep,
} from "#web/domain/chat/model.ts";

import { parseStreamFrame, type StreamFrame } from "./stream-frame.ts";

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
    readonly maxQuestionChars?: number;
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

type StreamIdentity = { readonly threadId: null | string; readonly runId: null | string };

const isMatchingIdentity = (frame: StreamFrame, identity: StreamIdentity): boolean => {
  switch (frame.type) {
    case "meta": {
      return (
        (identity.threadId === null || frame.threadId === identity.threadId) &&
        (identity.runId === null || frame.runId === identity.runId)
      );
    }
    case "title": {
      return frame.threadId === identity.threadId;
    }
    case "done": {
      return frame.runId === identity.runId;
    }
    case "delta":
    case "error":
    case "step": {
      return true;
    }
  }
};

const deliverFrame = (frame: StreamFrame, callbacks: WsStreamCallbacks): void => {
  switch (frame.type) {
    case "meta": {
      callbacks.onMeta(frame);
      return;
    }
    case "done": {
      callbacks.onDone(frame);
      return;
    }
    case "title": {
      if ((frame.title.match(/./gsu)?.length ?? 0) <= 48) {
        callbacks.onTitle(frame.threadId, frame.title);
      }
      return;
    }
    case "step": {
      callbacks.onStep(frame.steps);
      return;
    }
    case "delta": {
      callbacks.onDelta(frame.text);
      return;
    }
    case "error": {
      const { type: _type, ...error } = frame;
      callbacks.onError(error);
      return;
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
    const parsed = typeof event.data === "string" ? parseStreamFrame(event.data) : null;
    if (parsed === null) {
      isFinished = true;
      callbacks.onError({
        code: "invalid_frame",
        message: "Не удалось прочитать ответ сервера. Попробуй еще раз.",
      });
      ws.close();
      return;
    }
    if (parsed.type === "unknown" || !isMatchingIdentity(parsed, identity)) {
      return;
    }
    if (parsed.type === "meta") {
      identity = { threadId: parsed.threadId, runId: parsed.runId };
    }
    isFinished = parsed.type === "done" || parsed.type === "error";
    deliverFrame(parsed, callbacks);
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
