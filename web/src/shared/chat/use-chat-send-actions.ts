import { useCallback, useState } from "react";

import type { ChatDocContext, ChatMessage, ChatQuote, ChatUser } from "#web/domain/chat.ts";

import type { ChatStreamController } from "./use-chat-stream.ts";
import type { useThreadState } from "./use-thread-state.ts";

export const useComposerDraft = (docKey: string, user: ChatUser | null) => {
  type Draft = {
    readonly docKey: string;
    readonly key: string;
    readonly text: string;
    readonly quote: ChatQuote | null;
    readonly unsent: ChatMessage | null;
  };
  const key = String(user?.id ?? "guest");
  const [draft, setDraft] = useState<Draft>({ key, docKey, text: "", quote: null, unsent: null });
  if (draft.key !== key) {
    setDraft({ key, docKey, text: "", quote: null, unsent: null });
  } else if (draft.docKey !== docKey) {
    setDraft({
      ...draft,
      docKey,
      quote: draft.quote?.messageId === undefined ? null : draft.quote,
    });
  }
  const updateDraft = (changes: Partial<Draft>): void => {
    setDraft((prev) => (prev.key === key ? { ...prev, ...changes } : prev));
  };
  return {
    draft: draft.text,
    quote: draft.quote,
    unsent: draft.unsent,
    setUnsent: (unsent: ChatMessage | null) => {
      updateDraft({ unsent });
    },
    setDraft: (text: string) => {
      updateDraft({ text });
    },
    setQuote: (quote: ChatQuote | null) => {
      updateDraft({ quote });
    },
    onLogin: (account: ChatUser | null) => {
      if (user === null && account !== null) {
        updateDraft({ key: String(account.id) });
      }
    },
  };
};

type SendHookDeps = {
  readonly docContext: ChatDocContext;
  readonly draft: string;
  readonly quote: ChatQuote | null;
  readonly stream: ChatStreamController;
  readonly thr: ReturnType<typeof useThreadState>;
};

export const useChatSendActions = ({ docContext, draft, quote, stream, thr }: SendHookDeps) => {
  const retryMessage = useCallback(
    async (assistantMsgId: string): Promise<void> => {
      if (thr.isStreaming || thr.isThreadLoading) {
        return;
      }
      const idx = thr.messages.findIndex((m) => m.id === assistantMsgId);
      const userMsg = idx > 0 ? thr.messages[idx - 1] : undefined;
      const assistant = thr.messages.at(-1);
      if (
        userMsg?.role !== "user" ||
        assistant?.id !== assistantMsgId ||
        assistant.role !== "assistant"
      ) {
        return;
      }
      await stream.sendQuestion({
        activeThreadId: thr.activeThreadId,
        docContext: userMsg.page,
        quote: userMsg.quote,
        retryMessage: assistant,
        text: userMsg.contentTex,
      });
    },
    [stream, thr.activeThreadId, thr.isStreaming, thr.isThreadLoading, thr.messages],
  );

  const send = useCallback(
    async (overrideText?: string): Promise<void> => {
      if (thr.isStreaming || thr.isThreadLoading) {
        return;
      }
      const text = (overrideText ?? draft).trim();
      if (text === "" && quote === null) {
        return;
      }
      await stream.sendQuestion({ activeThreadId: thr.activeThreadId, docContext, quote, text });
    },
    [docContext, draft, quote, stream, thr.activeThreadId, thr.isStreaming, thr.isThreadLoading],
  );

  return { retryMessage, send };
};
