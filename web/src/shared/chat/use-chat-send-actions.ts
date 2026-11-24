import { useCallback, useState } from "react";

import type { ChatDocContext, ChatQuote, ChatUser } from "#web/domain/chat.ts";

import type { useThreadState } from "./use-chat-state.ts";
import type { ChatStreamController } from "./use-chat-stream.ts";

export const useComposerDraft = (docKey: string, user: ChatUser | null) => {
  type Draft = { readonly key: string; readonly text: string; readonly quote: ChatQuote | null };
  const key = `${docKey}:${user?.id ?? "guest"}`;
  const [draft, setDraft] = useState<Draft>({ key, text: "", quote: null });
  if (draft.key !== key) {
    setDraft({ key, text: "", quote: null });
  }
  const updateDraft = (changes: Partial<Draft>): void => {
    setDraft((prev) => (prev.key === key ? { ...prev, ...changes } : prev));
  };
  return {
    draft: draft.text,
    quote: draft.quote,
    setDraft: (text: string) => {
      updateDraft({ text });
    },
    setQuote: (quote: ChatQuote | null) => {
      updateDraft({ quote });
    },
    onLogin: (account: ChatUser | null) => {
      if (user === null && account !== null) {
        updateDraft({ key: `${docKey}:${account.id}` });
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
        docContext,
        quote: userMsg.quote,
        retryMessage: assistant,
        text: userMsg.contentTex,
      });
    },
    [docContext, stream, thr.activeThreadId, thr.isStreaming, thr.isThreadLoading, thr.messages],
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
