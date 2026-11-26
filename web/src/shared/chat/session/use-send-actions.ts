import type { ChatBlock, ChatDocContext, ChatQuote } from "#web/domain/chat/model.ts";

import type { UnsentQuestion } from "../stream/types.ts";
import type { ChatStreamController } from "../stream/use-stream.ts";
import type { useTelegramAuthActions } from "./use-state.ts";
import type { useThreadState } from "./use-thread-state.ts";

type SendHookDeps = {
  readonly unsent: null | UnsentQuestion;
  readonly block: ChatBlock | null;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly docContext: ChatDocContext;
  readonly maxQuestionChars: number;
  readonly draft: string;
  readonly editUnsent: () => void;
  readonly quote: ChatQuote | null;
  readonly stream: ChatStreamController;
  readonly thr: ReturnType<typeof useThreadState>;
};

/** Nothing is sent while an answer streams or the thread is not on screen (still loading or failed). */
const isBusy = (thr: SendHookDeps["thr"]): boolean =>
  thr.isStreaming || thr.isThreadLoading || thr.isThreadFailed;

const retryAnswer = async (
  assistantMsgId: string,
  thr: SendHookDeps["thr"],
  stream: ChatStreamController,
): Promise<void> => {
  if (isBusy(thr)) {
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
};

export const chatSendActions = ({
  docContext,
  maxQuestionChars,
  draft,
  quote,
  stream,
  thr,
  unsent,
  editUnsent,
  block,
  tgAuth,
}: SendHookDeps) => {
  const send = async (overrideText?: string): Promise<void> => {
    if (isBusy(thr)) {
      return;
    }
    const text = (overrideText ?? draft).trim();
    if (text.length > maxQuestionChars || (text === "" && quote === null)) {
      return;
    }
    await stream.sendQuestion({ activeThreadId: thr.activeThreadId, docContext, quote, text });
  };

  return {
    retryMessage: async (id: string) => {
      if (unsent?.id !== id) {
        await retryAnswer(id, thr, stream);
        return;
      }
      if (block !== null || unsent.threadId !== thr.activeThreadId || isBusy(thr)) {
        return;
      }
      if (unsent.errorMessage !== null) {
        editUnsent();
        return;
      }
      tgAuth.clearVerificationError();
      await stream.sendQuestion({
        activeThreadId: unsent.threadId,
        docContext: unsent.page,
        quote: unsent.quote,
        text: unsent.contentTex,
        keepDraft: true,
      });
    },
    send: async (text?: string) => {
      tgAuth.clearVerificationError();
      await send(text);
    },
  };
};
