import type { WsStreamCallbacks } from "#web/api/chat/stream.ts";
import type { ChatStep } from "#web/domain/chat/model.ts";

import type { SendArgs, StreamStateSetters } from "./types.ts";

import {
  applyMetaMessageIds,
  makeUserMsg,
  patchLastAssistant,
  rejectOptimisticTurn,
  resetRetryAssistant,
  rollbackOptimisticTurn,
} from "./helpers.ts";

const guardStreamCallbacks = (
  callbacks: WsStreamCallbacks,
  isCurrent: () => boolean,
): WsStreamCallbacks => {
  const guard =
    <Args extends readonly unknown[]>(listener: (...args: Args) => void) =>
    (...args: Args): void => {
      if (isCurrent()) {
        listener(...args);
      }
    };
  return {
    onCloseUnexpected: guard(callbacks.onCloseUnexpected),
    onCancelledBeforeStart: guard(() => callbacks.onCancelledBeforeStart?.()),
    onDelta: guard(callbacks.onDelta),
    onDone: guard(callbacks.onDone),
    onError: guard(callbacks.onError),
    onMeta: guard(callbacks.onMeta),
    onStep: guard(callbacks.onStep),
    onTitle: guard(callbacks.onTitle),
  };
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
  error: Parameters<WsStreamCallbacks["onError"]>[0],
): void => {
  if (runId === null && args.retryMessage !== undefined) {
    rollbackOptimisticTurn(setters, args);
    setters.setMessages((prev) =>
      patchLastAssistant(prev, (msg) => ({ ...msg, errorMessage: error.message })),
    );
    return;
  }
  if (runId === null && error.code === "invalid_quote") {
    rollbackOptimisticTurn(setters, args, { restoreDraft: false });
    setters.rejectQuote({
      ...makeUserMsg(args.text, null, args.docContext),
      threadId: args.activeThreadId,
      status: "error",
      errorMessage: error.message,
    });
    return;
  }
  if (
    runId === null &&
    (error.code === "context_too_large" || error.code === "question_too_long")
  ) {
    setters.restoreRejectedDraft(args.text, args.quote);
  }
  setters.setIsStreaming(false);
  setters.setMessages((prev) =>
    patchLastAssistant(prev, (m) => ({ ...m, status: "error", errorMessage: error.message })),
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
      errorMessage: payload.errorMessage ?? null,
      suggestion: payload.status === "done" ? (payload.suggestion ?? null) : null,
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
    onCancelledBeforeStart: () => {
      clearActive();
      rejectOptimisticTurn(setters, args);
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
      if (payload.code === "question_too_long" && payload.maxQuestionChars !== undefined) {
        setters.setQuestionLimit(payload.maxQuestionChars);
      }
      if (payload.block !== undefined && payload.block !== null) {
        setters.setBlock(payload.block);
        if (runId === null) {
          rejectOptimisticTurn(setters, args);
          return;
        }
      }
      failTurn(deps, runId, payload);
    },
    onMeta: (payload) => {
      const isFirstMeta = runId === null;
      runId = payload.runId;
      setters.setActiveThreadId(payload.threadId);
      if (payload.replayed !== true) {
        setters.setDegraded(payload.degraded);
      }
      const retryId = args.retryMessage?.id;
      if (retryId !== undefined && isFirstMeta) {
        setters.setMessages((prev) => resetRetryAssistant(prev, retryId));
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
          contextLimited: payload.contextLimited === true,
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

export const buildStreamCallbacks = (
  deps: WsCallbackDeps,
  isCurrent: () => boolean,
): WsStreamCallbacks => guardStreamCallbacks(buildWsCallbacks(deps), isCurrent);
