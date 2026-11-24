import { useCallback, useRef } from "react";

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
import { useRunStatusPoller } from "./use-chat-state.ts";

export type StreamStateSetters = {
  readonly loadThread: (ctx: ChatDocContext, threadId?: null | string) => Promise<void>;
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
  readonly retryAssistantMessageId?: string;
  readonly text: string;
};

export type ChatStreamController = {
  readonly sendQuestion: (args: SendArgs) => Promise<void>;
  readonly stopActive: () => void;
};

type WsCallbackDeps = {
  readonly args: SendArgs;
  readonly clearActive: () => void;
  readonly getRunId: () => null | string;
  readonly onReconnectPoll: (runId: string, threadId: null | string) => void;
  readonly setRunId: (id: null | string) => void;
  readonly setters: StreamStateSetters;
};

const buildWsCallbacks = (deps: WsCallbackDeps): WsStreamCallbacks => {
  const { args, clearActive, getRunId, onReconnectPoll, setRunId, setters } = deps;
  let streamThreadId = args.activeThreadId;
  return {
    onCloseUnexpected: () => {
      clearActive();
      const rid = getRunId();
      if (rid === null) {
        setters.setIsStreaming(false);
      } else {
        onReconnectPoll(rid, streamThreadId);
      }
    },
    onDelta: (delta) => {
      setters.setMessages((prev) =>
        patchLastAssistant(prev, (m) => ({ ...m, contentTex: m.contentTex + delta })),
      );
    },
    onDone: (payload) => {
      clearActive();
      setRunId(null);
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
      setRunId(null);
      setters.setIsStreaming(false);
      if (payload.block !== undefined && payload.block !== null) {
        setters.setBlock(payload.block);
        setters.setDraft(args.text);
        setters.setQuote(args.quote);
        setters.setMessages((prev) => prev.slice(0, -2));
        return;
      }
      setters.setMessages((prev) =>
        patchLastAssistant(prev, (m) => ({ ...m, errorMessage: payload.message, status: "error" })),
      );
    },
    onMeta: (payload) => {
      streamThreadId = payload.threadId;
      setRunId(payload.runId);
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
): Promise<AllowanceOutcome> => {
  try {
    const allowance = await ensureChatAllowance(turnstileHooks);
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

const startOptimisticTurn = (
  setters: StreamStateSetters,
  args: SendArgs,
  saveSnapshot: (msgs: null | readonly ChatMessage[]) => void,
): void => {
  setters.setBlock(null);
  setters.setIsStreaming(true);
  const retryId = args.retryAssistantMessageId;
  if (retryId !== undefined) {
    setters.setMessages((prev) => {
      saveSnapshot(prev);
      return resetRetryAssistant(prev, retryId);
    });
    return;
  }
  saveSnapshot(null);
  setters.setDraft("");
  setters.setQuote(null);
  setters.setPreviousThreadId(null);
  setters.setMessages((prev) => [...prev, makeUserMsg(args.text, args.quote), makeAssistantMsg()]);
};

const rollbackOptimisticTurn = (
  setters: StreamStateSetters,
  args: SendArgs,
  takeSnapshot: () => null | readonly ChatMessage[],
): void => {
  setters.setIsStreaming(false);
  const restored = takeSnapshot();
  if (restored !== null) {
    setters.setMessages(() => restored);
    return;
  }
  setters.setMessages((prev) => prev.slice(0, -2));
  setters.setDraft(args.text);
  setters.setQuote(args.quote);
};

export const useChatStream = (
  setters: StreamStateSetters,
  turnstileHooks: TurnstileHooks,
): ChatStreamController => {
  const streamRef = useRef<ActiveWsStream | null>(null);
  const runIdRef = useRef<null | string>(null);
  const abortedPreWsRef = useRef(false);
  const retrySnapshotRef = useRef<null | readonly ChatMessage[]>(null);
  const pollRunStatus = useRunStatusPoller(setters, runIdRef);

  const stopActive = useCallback((): void => {
    if (streamRef.current !== null) {
      streamRef.current.stop();
      return;
    }
    abortedPreWsRef.current = true;
    cancelActiveTurnstile();
  }, []);

  const sendQuestion = useCallback(
    async (args: SendArgs): Promise<void> => {
      abortedPreWsRef.current = false;
      startOptimisticTurn(setters, args, (snap) => {
        retrySnapshotRef.current = snap;
      });
      const outcome = await fetchAllowanceOutcome(turnstileHooks, setters);
      const wasAborted = (): boolean => abortedPreWsRef.current;
      if (wasAborted() || outcome.kind === "blocked" || outcome.kind === "cancelled") {
        rollbackOptimisticTurn(setters, args, () => {
          const prev = retrySnapshotRef.current;
          retrySnapshotRef.current = null;
          return prev;
        });
        return;
      }
      if (outcome.kind === "error") {
        setters.setIsStreaming(false);
        setters.setMessages((prev) =>
          patchLastAssistant(prev, (m) => ({
            ...m,
            errorMessage: outcome.message,
            status: "error",
          })),
        );
        return;
      }
      const callbacks = buildWsCallbacks({
        args,
        clearActive: () => {
          streamRef.current = null;
        },
        getRunId: () => runIdRef.current,
        onReconnectPoll: (rid, tid) => {
          pollRunStatus(rid, args.docContext, tid);
        },
        setRunId: (id) => {
          runIdRef.current = id;
        },
        setters,
      });
      streamRef.current = openChatMessageStream(
        getChatEnvConfig().apiUrl,
        {
          allowanceToken: outcome.allowance.allowanceToken,
          browserToken: outcome.allowance.browserToken,
          clientRequestId: crypto.randomUUID(),
          course: args.docContext.course,
          docId: args.docContext.docId,
          quote: args.quote,
          retryAssistantMessageId: args.retryAssistantMessageId ?? null,
          text: args.text,
          threadId: args.activeThreadId,
        },
        callbacks,
      );
    },
    [pollRunStatus, setters, turnstileHooks],
  );

  return { sendQuestion, stopActive };
};
