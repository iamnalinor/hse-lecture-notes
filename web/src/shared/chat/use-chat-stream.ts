import { useCallback, useEffect, useRef } from "react";

import type {
  ChatDocContext,
  ChatMessage,
  ChatQuote,
  ChatStep,
  ChatThreadSummary,
} from "#web/domain/chat.ts";

import { type ChatAccess, getChatEnvConfig } from "#web/api/chat-client.ts";
import {
  type ActiveWsStream,
  openChatMessageStream,
  type WsStreamCallbacks,
} from "#web/api/chat-stream.ts";
import { cancelActiveTurnstile, type TurnstileHooks } from "#web/api/chat-widgets.ts";

import { type AllowanceSetters, fetchAllowanceOutcome } from "./chat-allowance.ts";
import {
  applyMetaMessageIds,
  optimisticMessages,
  patchLastAssistant,
  resetRetryAssistant,
} from "./chat-stream-helpers.ts";

export type StreamStateSetters = AllowanceSetters & {
  readonly setPollRunId: (id: null | string) => void;
  readonly setActiveThreadId: (id: null | string) => void;
  readonly setDraft: (text: string) => void;
  readonly setIsStreaming: (isStreaming: boolean) => void;
  readonly setMessages: (updater: (prev: readonly ChatMessage[]) => readonly ChatMessage[]) => void;
  readonly setQuote: (quote: ChatQuote | null) => void;
  readonly setThreads: (
    updater: (prev: readonly ChatThreadSummary[]) => readonly ChatThreadSummary[],
  ) => void;
};

export type SendArgs = {
  readonly activeThreadId: null | string;
  readonly docContext: ChatDocContext;
  readonly quote: ChatQuote | null;
  readonly retryMessage?: ChatMessage;
  readonly text: string;
};

export type ChatStreamController = {
  readonly sendQuestion: (args: SendArgs) => Promise<void>;
  readonly stopActive: () => void;
};

type WsCallbackDeps = {
  readonly clientRequestId: string;
  readonly args: SendArgs;
  readonly clearActive: () => void;
  readonly setters: StreamStateSetters;
};

const failTurn = (
  { setters, args }: WsCallbackDeps,
  runId: null | string,
  message: string,
): void => {
  if (runId === null && args.retryMessage !== undefined) {
    rollbackOptimisticTurn(setters, args);
    return;
  }
  setters.setIsStreaming(false);
  setters.setMessages((prev) =>
    patchLastAssistant(prev, (m) => ({ ...m, status: "error", errorMessage: message })),
  );
};

const markUnconfirmed = ({ setters, args, clientRequestId }: WsCallbackDeps): void => {
  setters.setIsStreaming(false);
  setters.setMessages((prev) =>
    patchLastAssistant(prev, (m) => ({
      ...(args.retryMessage ?? m),
      status: "error",
      pendingRequestId: clientRequestId,
      errorMessage: "Соединение прервано до подтверждения. Можно повторить запрос.",
    })),
  );
};

const finishTurn = (
  setters: StreamStateSetters,
  payload: Parameters<WsStreamCallbacks["onDone"]>[0],
): void => {
  setters.setIsStreaming(payload.replayed === true);
  if (payload.replayed === true) {
    setters.setPollRunId(payload.runId);
    return;
  }
  setters.setDegraded(payload.degraded);
  if (payload.block !== null) {
    setters.setBlock(payload.block);
  }
  setters.setMessages((prev) =>
    patchLastAssistant(prev, (m) => ({
      ...m,
      contentTex: payload.text === "" ? m.contentTex : payload.text,
      status: payload.status,
      steps: payload.steps.length > 0 ? payload.steps : m.steps,
    })),
  );
};

const buildWsCallbacks = (deps: WsCallbackDeps): WsStreamCallbacks => {
  const { args, clearActive, setters } = deps;
  let runId: null | string = null;

  return {
    onTitle: (threadId, title) => {
      setters.setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title, generatedTitle: title } : t)),
      );
    },
    onCloseUnexpected: () => {
      clearActive();
      if (runId === null) {
        markUnconfirmed(deps);
      } else {
        setters.setPollRunId(runId);
      }
    },
    onDelta: (delta) => {
      setters.setMessages((prev) =>
        patchLastAssistant(prev, (m) => ({ ...m, contentTex: m.contentTex + delta })),
      );
    },
    onDone: (payload) => {
      clearActive();
      finishTurn(setters, payload);
    },
    onError: (payload) => {
      clearActive();
      if (payload.block !== undefined && payload.block !== null) {
        setters.setBlock(payload.block);
        if (runId === null) {
          rollbackOptimisticTurn(setters, args);
          return;
        }
      }
      failTurn(deps, runId, payload.message);
    },
    onMeta: (payload) => {
      runId = payload.runId;
      setters.setActiveThreadId(payload.threadId);
      if (payload.replayed !== true) {
        setters.setDegraded(payload.degraded);
      }
      setters.setMessages((prev) =>
        applyMetaMessageIds(prev, {
          assistantId: payload.assistantMessageId,
          runId: payload.runId,
          userId: payload.userMessageId,
        }),
      );
      setters.setThreads((prev) => [
        {
          id: payload.threadId,
          title: payload.threadTitle,
          generatedTitle: payload.generatedTitle ?? null,
          updatedAt: Date.now(),
        },
        ...prev.filter((t) => t.id !== payload.threadId),
      ]);
    },
    onStep: (steps: readonly ChatStep[]) => {
      setters.setMessages((prev) => patchLastAssistant(prev, (m) => ({ ...m, steps })));
    },
  };
};

const startOptimisticTurn = (setters: StreamStateSetters, args: SendArgs): void => {
  setters.setBlock(null);
  setters.setIsStreaming(true);
  const retryId = args.retryMessage?.id;
  if (retryId !== undefined) {
    setters.setMessages((prev) => {
      return resetRetryAssistant(prev, retryId);
    });
    return;
  }
  setters.setDraft("");
  setters.setQuote(null);
  const turn = optimisticMessages(args.text, args.quote, args.docContext);
  setters.setMessages((prev) => [...prev, ...turn]);
};

const rollbackOptimisticTurn = (setters: StreamStateSetters, args: SendArgs): void => {
  setters.setIsStreaming(false);
  const original = args.retryMessage;
  if (original !== undefined) {
    setters.setMessages((prev) => prev.map((m) => (m.id === original.id ? original : m)));
    return;
  }
  setters.setMessages((prev) => prev.slice(0, -2));
  setters.setDraft(args.text);
  setters.setQuote(args.quote);
};

const connectStream = (
  args: SendArgs & { readonly clientRequestId: string },
  allowance: ChatAccess,
  callbacks: WsStreamCallbacks,
): ActiveWsStream | null => {
  try {
    return openChatMessageStream(
      getChatEnvConfig().apiUrl,
      {
        allowanceToken: allowance.allowanceToken,
        browserToken: allowance.browserToken,
        clientRequestId: args.clientRequestId,
        course: args.docContext.course,
        docId: args.docContext.docId,
        quote: args.quote,
        retryAssistantMessageId:
          args.retryMessage === undefined || args.retryMessage.runId === null
            ? null
            : args.retryMessage.id,
        text: args.text,
        threadId: args.activeThreadId,
      },
      callbacks,
    );
  } catch {
    callbacks.onCloseUnexpected();
    return null;
  }
};

export const useChatStream = (
  setters: StreamStateSetters,
  turnstileHooks: TurnstileHooks,
): ChatStreamController => {
  const streamRef = useRef<ActiveWsStream | null>(null);
  const abortedPreWsRef = useRef(false);
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.disconnect();
    };
  }, []);

  const isCurrent = useCallback((): boolean => mountedRef.current && !abortedPreWsRef.current, []);

  const stopActive = useCallback((): void => {
    if (streamRef.current !== null) {
      streamRef.current.stop();
      return;
    }
    abortedPreWsRef.current = true;
    cancelActiveTurnstile();
  }, []);

  const clearActive = useCallback((): void => {
    sendingRef.current = false;
    streamRef.current = null;
  }, []);

  const startTurn = useCallback(
    (args: SendArgs, clientRequestId: string) => {
      sendingRef.current = true;
      abortedPreWsRef.current = false;
      startOptimisticTurn(setters, args);
      return buildWsCallbacks({ args, clearActive, clientRequestId, setters });
    },
    [clearActive, setters],
  );
  const sendQuestion = useCallback(
    async (args: SendArgs): Promise<void> => {
      if (sendingRef.current) {
        return;
      }
      const clientRequestId = args.retryMessage?.pendingRequestId ?? crypto.randomUUID();
      const callbacks = startTurn(args, clientRequestId);
      const outcome = await fetchAllowanceOutcome(turnstileHooks, setters, isCurrent);
      if (!mountedRef.current) {
        return;
      }
      if (outcome.kind === "error") {
        callbacks.onError({ code: "allowance_error", message: outcome.message });
        return;
      }
      if (outcome.kind !== "ok" || !isCurrent()) {
        clearActive();
        rollbackOptimisticTurn(setters, args);
        return;
      }
      streamRef.current = connectStream({ ...args, clientRequestId }, outcome.allowance, callbacks);
    },
    [clearActive, isCurrent, setters, startTurn, turnstileHooks],
  );

  return { sendQuestion, stopActive };
};
