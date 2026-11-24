import type { ChatMessage, ChatQuote } from "#web/domain/chat.ts";

export const makeUserMsg = (text: string, quote: ChatQuote | null): ChatMessage => ({
  contentTex: text,
  createdAt: Date.now(),
  errorMessage: null,
  id: `opt_u_${crypto.randomUUID()}`,
  quote,
  role: "user",
  runId: null,
  seq: 0,
  status: "done",
  steps: [],
});

export const makeAssistantMsg = (): ChatMessage => ({
  contentTex: "",
  createdAt: Date.now(),
  errorMessage: null,
  id: `opt_a_${crypto.randomUUID()}`,
  quote: null,
  role: "assistant",
  runId: null,
  seq: 0,
  status: "running",
  steps: [],
});

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
      return { ...msg, id: ids.assistantId, runId: ids.runId };
    }
    if (idx === aIdx - 1 && msg.role === "user") {
      return { ...msg, id: ids.userId, runId: ids.runId };
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
  if (target === undefined) {
    return prev;
  }
  const reset: ChatMessage = {
    ...target,
    contentTex: "",
    errorMessage: null,
    status: "running",
    steps: [],
  };
  return [...prev.slice(0, idx), reset];
};
