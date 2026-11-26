import type {
  ChatBlock,
  ChatDegraded,
  ChatMessageStatus,
  ChatQuote,
  ChatStep,
} from "#web/domain/chat/model.ts";

import { parseStreamFrame, type StreamFrame } from "./stream-frame.ts";
import { createStopController } from "./stream-stop.ts";

export type ChatStreamCallbacks = {
  readonly onStopError: (message: null | string) => void;
  readonly onTitle: (threadId: string, title: string) => void;
  readonly onCloseUnexpected: () => void;
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
    readonly retryAfterSec?: number;
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

export type ActiveChatStream = {
  readonly disconnect: () => void;
  readonly stop: () => void;
};

export type SendChatParams = {
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

const deliverFrame = (frame: StreamFrame, callbacks: ChatStreamCallbacks): void => {
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

/** A terminal frame can arrive before the HTTP connection closes. */
const readLines = async (
  body: NonNullable<Response["body"]>,
  isTerminalLine: (line: string) => boolean,
  signal: AbortSignal,
): Promise<void> => {
  const reader = body.pipeThrough(new TextDecoderStream(), { signal }).getReader();
  let pending = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      const lines = (pending + (chunk.value ?? "")).split("\n");
      pending = chunk.done ? "" : (lines.pop() ?? "");
      if (lines.some((line) => line.trim() !== "" && isTerminalLine(line)) || chunk.done) {
        return;
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
};

const admissionError = async (
  response: Response,
): Promise<Extract<StreamFrame, { type: "error" }> | null> => {
  const frame = parseStreamFrame(await response.text());
  return frame?.type === "error" ? frame : null;
};

const postMessage = (
  apiUrl: string,
  params: SendChatParams,
  signal: AbortSignal,
): Promise<Response> =>
  fetch(`${apiUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ ...params, type: "send" }),
    credentials: "omit",
    redirect: "error",
    signal,
  });

export const openChatMessageStream = (
  apiUrl: string,
  params: SendChatParams,
  callbacks: ChatStreamCallbacks,
): ActiveChatStream => {
  const controller = new AbortController();
  let isDetached = false;
  let isFinished = false;
  let hasResponse = false;
  let identity: StreamIdentity = { threadId: params.threadId, runId: null };

  const stopping = createStopController(apiUrl, params.browserToken, (message) => {
    if (!isDetached && !isFinished) {
      callbacks.onStopError(message);
    }
  });

  const releaseIfDetached = (): void => {
    if (isDetached && hasResponse && !stopping.isWaitingForMeta()) {
      controller.abort();
    }
  };
  const isTerminalLine = (line: string): boolean => {
    const frame =
      parseStreamFrame(line) ??
      ({
        type: "error",
        code: "invalid_frame",
        message: "Не удалось прочитать ответ сервера. Попробуй еще раз.",
      } as const);
    if (frame.type === "unknown" || !isMatchingIdentity(frame, identity)) {
      return false;
    }
    if (frame.type === "meta") {
      identity = { threadId: frame.threadId, runId: frame.runId };
      stopping.setRun(frame.runId);
      releaseIfDetached();
    }
    isFinished = frame.type === "done" || frame.type === "error";
    if (!isDetached) {
      deliverFrame(frame, callbacks);
    }
    return isFinished;
  };
  const receive = async (): Promise<void> => {
    const response = await postMessage(apiUrl, params, controller.signal);
    hasResponse = true;
    releaseIfDetached();
    if (!response.ok) {
      const error = await admissionError(response);
      // An unrecognized response may have been generated by a proxy after admission.
      // Let the normal disconnect path keep the request ID for an idempotent retry.
      isFinished = error !== null;
      if (!isDetached && error !== null) {
        deliverFrame(error, callbacks);
      }
    } else if (response.body !== null) {
      await readLines(response.body, isTerminalLine, controller.signal);
    }
  };
  const monitor = async (): Promise<void> => {
    try {
      await receive();
    } catch {
      // A dropped response recovers via run status; a deliberate detach has no UI listener.
    }
    if (!isDetached && !isFinished) {
      callbacks.onCloseUnexpected();
    }
    isFinished = true;
  };
  void monitor();
  return {
    disconnect: () => {
      isDetached = true;
      releaseIfDetached();
    },
    stop: () => {
      if (!isFinished && !isDetached) {
        stopping.stop();
      }
    },
  };
};
