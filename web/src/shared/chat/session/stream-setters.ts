import type { StreamStateSetters } from "../stream/types.ts";
import type { useComposerDrafts } from "./use-composer-drafts.ts";
import type { useChatAuthState } from "./use-state.ts";
import type { useThreadState } from "./use-thread-state.ts";

export const streamSetters = (
  auth: ReturnType<typeof useChatAuthState>,
  composer: ReturnType<ReturnType<typeof useComposerDrafts>["forThread"]>,
  thr: ReturnType<typeof useThreadState>,
): StreamStateSetters => {
  return {
    restoreRejectedDraft: composer.restoreRejectedDraft,
    rejectQuote: composer.rejectQuote,
    setUnsent: composer.setUnsent,
    setPollRunId: thr.setPollRunId,
    setActiveThreadId: (id) => {
      if (id !== null) {
        composer.assignThread(id);
      }
      thr.setActiveThreadId(id);
    },
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setQuestionLimit: auth.setQuestionLimit,
    setDraft: composer.setDraft,
    setIsStreaming: thr.setIsStreaming,
    setMessages: thr.setMessages,
    setQuote: composer.setQuote,
    setThreads: thr.setThreads,
    setTier: auth.setTier,
    setUser: auth.setUser,
  };
};
