import { useCallback, useState } from "react";

import type { ChatDocContext, ChatQuote, ChatUser } from "#web/domain/chat/model.ts";

import type { UnsentQuestion } from "../stream/types.ts";
import type { ChatStreamController } from "../stream/use-stream.ts";
import type { useThreadState } from "./use-thread-state.ts";

export const useComposerDraft = (docKey: string, user: ChatUser | null) => {
  type Draft = {
    readonly docKey: string;
    readonly key: string;
    readonly text: string;
    readonly quote: ChatQuote | null;
    readonly unsent: null | UnsentQuestion;
    readonly resume: null | UnsentQuestion;
  };
  const key = String(user?.id ?? "guest");
  const [draft, setDraft] = useState<Draft>({
    key,
    docKey,
    text: "",
    quote: null,
    unsent: null,
    resume: null,
  });
  if (draft.key !== key) {
    setDraft({ key, docKey, text: "", quote: null, unsent: null, resume: null });
  } else if (draft.docKey !== docKey) {
    setDraft({
      ...draft,
      docKey,
      resume: null,
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
    resume: draft.resume,
    clearResume: () => {
      updateDraft({ resume: null });
    },
    restoreRejectedDraft: (text: string, quote: ChatQuote | null) => {
      setDraft((prev) =>
        prev.key === key && prev.docKey === docKey && prev.text === "" && prev.quote === null
          ? { ...prev, text, quote }
          : prev,
      );
    },
    setUnsent: (unsent: null | UnsentQuestion) => {
      updateDraft({ unsent, resume: null });
    },
    setDraft: (text: string) => {
      updateDraft({ text, resume: null });
    },
    setQuote: (quote: ChatQuote | null) => {
      updateDraft({ quote, resume: null });
    },
    onLogin: (account: ChatUser | null, canResume: boolean) => {
      if (user === null && account !== null) {
        setDraft((prev) =>
          prev.key === key
            ? {
                ...prev,
                key: String(account.id),
                resume:
                  canResume &&
                  prev.docKey === docKey &&
                  prev.unsent !== null &&
                  prev.text === prev.unsent.contentTex &&
                  prev.quote === prev.unsent.quote &&
                  `${prev.unsent.page.course}:${prev.unsent.page.docId}` === docKey
                    ? prev.unsent
                    : null,
              }
            : prev,
        );
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
