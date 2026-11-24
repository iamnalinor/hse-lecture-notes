import { useCallback, useEffect, useRef } from "react";

import type {
  ChatBlock,
  ChatDegraded,
  ChatDocContext,
  ChatMessage,
  ChatQuote,
  ChatStep,
  ChatThreadSummary,
  ChatTier,
  ChatUser,
} from "#web/domain/chat.ts";

import {
  type AllowanceResponse,
  ensureChatAllowance,
  getChatEnvConfig,
} from "#web/api/chat-client.ts";
import {
  type ActiveWsStream,
  openChatMessageStream,
  type WsStreamCallbacks,
} from "#web/api/chat-stream.ts";
import { cancelActiveTurnstile, type TurnstileHooks } from "#web/api/chat-widgets.ts";

import {
  applyMetaMessageIds,
  makeAssistantMsg,
  makeUserMsg,
  patchLastAssistant,
  resetRetryAssistant,
} from "./chat-stream-helpers.ts";

export type StreamStateSetters = {
  readonly setPollRunId: (id: null | string) => void;
  readonly setActiveThreadId: (id: null | string) => void;
  readonly setBlock: (block: ChatBlock | null) => void;
  readonly setDegraded: (degraded: ChatDegraded) => void;
  readonly setDraft: (text: string) => void;
  readonly setIsStreaming: (isStreaming: boolean) => void;
  readonly setMessages: (updater: (prev: readonly ChatMessage[]) => readonly ChatMessage[]) => void;
  readonly setPreviousThreadId: (id: null | string) => void;
  readonly setQuote: (quote: ChatQuote | null) => void;
  readonly setThreads: (
    updater: (prev: readonly ChatThreadSummary[]) => readonly ChatThreadSummary[],
  ) => void;
  readonly setTier: (tier: ChatTier) => void;
  readonly setUser: (user: ChatUser | null) => void;
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
  readonly args: SendArgs;
  readonly clearActive: () => void;
  readonly setters: StreamStateSetters;
};

const buildWsCallbacks = (deps: WsCallbackDeps): WsStreamCallbacks => {
  const { args, clearActive, setters } = deps;
  let runId: null | string = null;
  const fail = (message: string): void => {
    if (runId === null && args.retryMessage !== undefined) {
      rollbackOptimisticTurn(setters, args);
      return;
    }
    setters.setIsStreaming(false);
    setters.setMessages((prev) =>
      patchLastAssistant(prev, (m) => ({ ...m, status: "error", errorMessage: message })),
    );
  };

  return {
    onCloseUnexpected: () => {
      clearActive();
      if (runId === null) {
        fail("Соединение прервано. Попробуйте ещё раз.");
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
      setters.setIsStreaming(false);
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
      fail(payload.message);
    },
    onMeta: (payload) => {
      runId = payload.runId;
      setters.setActiveThreadId(payload.threadId);
      setters.setDegraded(payload.degraded);
      setters.setMessages((prev) =>
        applyMetaMessageIds(prev, {
          assistantId: payload.assistantMessageId,
          runId: payload.runId,
          userId: payload.userMessageId,
        }),
      );
      setters.setThreads((prev) => [
        { id: payload.threadId, title: payload.threadTitle, updatedAt: Date.now() },
        ...prev.filter((t) => t.id !== payload.threadId),
      ]);
    },
    onStep: (steps: readonly ChatStep[]) => {
      setters.setMessages((prev) => patchLastAssistant(prev, (m) => ({ ...m, steps })));
    },
  };
};

type AllowanceOutcome =
  | { readonly allowance: AllowanceResponse; readonly kind: "ok" }
  | { readonly kind: "blocked" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

const fetchAllowanceOutcome = async (
  turnstileHooks: TurnstileHooks,
  setters: StreamStateSetters,
  isCurrent: () => boolean,
): Promise<AllowanceOutcome> => {
  try {
    const allowance = await ensureChatAllowance(turnstileHooks);
    if (!isCurrent()) {
      return { kind: "cancelled" };
    }
    setters.setTier(allowance.tier);
    setters.setUser(allowance.user);
    setters.setDegraded(allowance.degraded);
    if (allowance.block !== null) {
      setters.setBlock(allowance.block);
      return { kind: "blocked" };
    }
    return { allowance, kind: "ok" };
  } catch (error) {
    if (error instanceof Error && error.message === "Turnstile cancelled") {
      return { kind: "cancelled" };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: `Ошибка доступа (/v1/allowance): ${detail}` };
  }
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
  setters.setPreviousThreadId(null);
  setters.setMessages((prev) => [...prev, makeUserMsg(args.text, args.quote), makeAssistantMsg()]);
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
  args: SendArgs,
  allowance: AllowanceResponse,
  callbacks: WsStreamCallbacks,
): ActiveWsStream | null => {
  try {
    return openChatMessageStream(
      getChatEnvConfig().apiUrl,
      {
        allowanceToken: allowance.allowanceToken,
        browserToken: allowance.browserToken,
        clientRequestId: crypto.randomUUID(),
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
    (args: SendArgs) => {
      sendingRef.current = true;
      abortedPreWsRef.current = false;
      startOptimisticTurn(setters, args);
      return buildWsCallbacks({ args, clearActive, setters });
    },
    [clearActive, setters],
  );
  const sendQuestion = useCallback(
    async (args: SendArgs): Promise<void> => {
      if (sendingRef.current) {
        return;
      }
      const callbacks = startTurn(args);
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
      streamRef.current = connectStream(args, outcome.allowance, callbacks);
    },
    [clearActive, isCurrent, setters, startTurn, turnstileHooks],
  );

  return { sendQuestion, stopActive };
};
