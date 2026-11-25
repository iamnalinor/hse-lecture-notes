import { useCallback, useState } from "react";

import type { ChatBlock, ChatDocContext, ChatQuote, ChatUser } from "#web/domain/chat/model.ts";

import type { UnsentQuestion } from "../stream/types.ts";
import type { ChatStreamController } from "../stream/use-stream.ts";
import type { useTelegramAuthActions } from "./use-state.ts";
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
  readonly unsent: null | UnsentQuestion;
  readonly block: ChatBlock | null;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly docContext: ChatDocContext;
  readonly draft: string;
  readonly quote: ChatQuote | null;
  readonly stream: ChatStreamController;
  readonly thr: ReturnType<typeof useThreadState>;
};

export const useChatSendActions = ({
  docContext,
  draft,
  quote,
  stream,
  thr,
  unsent,
  block,
  tgAuth,
}: SendHookDeps) => {
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

  return {
    retryMessage: async (id: string) => {
      if (unsent?.id !== id) {
        await retryMessage(id);
        return;
      }
      if (block !== null || tgAuth.checkingLogin || thr.isStreaming || thr.isThreadLoading) {
        return;
      }
      tgAuth.clearVerificationError();
      await stream.sendQuestion({
        activeThreadId: unsent.threadId,
        docContext: unsent.page,
        quote: unsent.quote,
        text: unsent.contentTex,
        keepDraft: draft !== unsent.contentTex || quote !== unsent.quote,
      });
    },
    send: async (text?: string) => {
      if (tgAuth.checkingLogin) {
        return;
      }
      tgAuth.clearVerificationError();
      await send(text);
    },
  };
};
