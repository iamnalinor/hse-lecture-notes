import type { ChatDocContext, ChatMessage, ChatQuote } from "#web/domain/chat/model.ts";

import type { SendArgs, StreamStateSetters } from "./types.ts";

export const makeUserMsg = (
  text: string,
  quote: ChatQuote | null,
  page: ChatDocContext,
): ChatMessage => ({
  contentTex: text,
  createdAt: Date.now(),
  page,
  errorMessage: null,
  id: `opt_u_${crypto.randomUUID()}`,
  quote,
  role: "user",
  runId: null,
  seq: 0,
  status: "done",
  steps: [],
});

export const makeAssistantMsg = (page: ChatDocContext): ChatMessage => ({
  contentTex: "",
  createdAt: Date.now(),
  page,
  errorMessage: null,
  id: `opt_a_${crypto.randomUUID()}`,
  quote: null,
  role: "assistant",
  runId: null,
  seq: 0,
  status: "running",
  steps: [],
});

export const optimisticMessages = (
  text: string,
  quote: ChatQuote | null,
  page: ChatDocContext,
): readonly ChatMessage[] => [makeUserMsg(text, quote, page), makeAssistantMsg(page)];

export const patchLastAssistant = (
  prev: readonly ChatMessage[],
  updater: (msg: ChatMessage) => ChatMessage,
): readonly ChatMessage[] => {
  const idx = prev.findLastIndex((m) => m.role === "assistant");
  const current = idx === -1 ? undefined : prev[idx];
  return current === undefined
    ? prev
    : [...prev.slice(0, idx), updater(current), ...prev.slice(idx + 1)];
};

export const applyMetaMessageIds = (
  prev: readonly ChatMessage[],
  ids: { readonly assistantId: string; readonly runId: string; readonly userId: string },
): readonly ChatMessage[] => {
  const aIdx = prev.findLastIndex((m) => m.role === "assistant");
  if (aIdx === -1) {
    return prev;
  }
  return prev.map((msg, idx) => {
    if (idx === aIdx) {
      return {
        ...msg,
        pendingRequestId: null,
        id: ids.assistantId,
        renderKey: msg.renderKey ?? msg.id,
        runId: ids.runId,
      };
    }
    if (idx === aIdx - 1 && msg.role === "user") {
      return { ...msg, id: ids.userId, renderKey: msg.renderKey ?? msg.id, runId: ids.runId };
    }
    return msg;
  });
};

export const resetRetryAssistant = (
  prev: readonly ChatMessage[],
  retryId: string,
): readonly ChatMessage[] => {
  const idx = prev.findIndex((m) => m.id === retryId);
  const target = idx === -1 ? undefined : prev[idx];
  if (target?.role !== "assistant" || idx !== prev.length - 1) {
    return prev;
  }
  const reset: ChatMessage = {
    ...target,
    contentTex: "",
    errorMessage: null,
    status: "running",
    suggestion: null,
    steps: [],
  };
  return [...prev.slice(0, -1), reset];
};

export const startOptimisticTurn = (setters: StreamStateSetters, args: SendArgs): void => {
  setters.setUnsent(null);
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

export const rollbackOptimisticTurn = (setters: StreamStateSetters, args: SendArgs): void => {
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

export const rejectOptimisticTurn = (setters: StreamStateSetters, args: SendArgs): void => {
  rollbackOptimisticTurn(setters, args);
  if (args.retryMessage === undefined) {
    setters.setUnsent({
      ...makeUserMsg(args.text, args.quote, args.docContext),
      status: "error",
      threadId: args.activeThreadId,
    });
  }
};
