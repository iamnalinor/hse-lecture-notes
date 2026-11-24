import type {
  ChatBlock,
  ChatDegraded,
  ChatMessageStatus,
  ChatQuote,
  ChatStep,
} from "#web/domain/chat.ts";

export type WsStreamCallbacks = {
  readonly onCloseUnexpected: () => void;
  readonly onDelta: (text: string) => void;
  readonly onDone: (payload: {
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
    readonly assistantMessageId: string;
    readonly degraded: ChatDegraded;
    readonly runId: string;
    readonly threadId: string;
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
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isTerminalWsFrame = (
  parsed: Record<string, unknown>,
  callbacks: WsStreamCallbacks,
): boolean => {
  switch (parsed["type"]) {
    case "meta": {
      callbacks.onMeta(parsed as unknown as Parameters<WsStreamCallbacks["onMeta"]>[0]);
      return false;
    }
    case "step": {
      callbacks.onStep((parsed["steps"] as ChatStep[] | undefined) ?? []);
      return false;
    }
    case "delta": {
      if (typeof parsed["text"] === "string") {
        callbacks.onDelta(parsed["text"]);
      }
      return false;
    }
    case "done": {
      callbacks.onDone(parsed as unknown as Parameters<WsStreamCallbacks["onDone"]>[0]);
      return true;
    }
    case "error": {
      callbacks.onError(parsed as unknown as Parameters<WsStreamCallbacks["onError"]>[0]);
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

  ws.addEventListener("open", () => {
    if (!isFinished) {
      ws.send(JSON.stringify({ ...params, type: "send" }));
    }
  });

  ws.addEventListener("message", (event) => {
    if (isFinished || typeof event.data !== "string") {
      return;
    }
    const parsed = parseFrame(event.data);
    if (parsed !== null && isTerminalWsFrame(parsed, callbacks)) {
      isFinished = true;
    }
  });

  ws.addEventListener("close", () => {
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
        ws.close();
      }
    },
  };
};
