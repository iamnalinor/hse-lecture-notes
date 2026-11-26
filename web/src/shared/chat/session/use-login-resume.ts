import { useEffect, useRef } from "react";

import type { ChatQuote } from "#web/domain/chat/model.ts";

import type { SendArgs, UnsentQuestion } from "../stream/types.ts";
import type { useChatAuthState } from "./use-state.ts";
import type { useThreadState } from "./use-thread-state.ts";

type Options = {
  readonly pending: null | UnsentQuestion;
  readonly ready: boolean;
  readonly draft: string;
  readonly quote: ChatQuote | null;
  readonly activeThreadId: null | string;
  readonly clear: () => void;
  readonly send: (args: SendArgs) => Promise<void>;
};
export const useLoginResume = ({
  pending,
  ready,
  draft,
  quote,
  activeThreadId,
  clear,
  send,
}: Options): void => {
  const claimedRef = useRef<null | string>(null);
  useEffect(() => {
    if (!ready || pending === null || claimedRef.current === pending.id) {
      return;
    }
    claimedRef.current = pending.id;
    clear();
    // The pending question waits as «Не отправлено» with an empty composer; anything typed since means
    // the reader moved on, so it is not sent behind their back.
    if (quote !== null || draft.trim() !== "" || activeThreadId !== pending.threadId) {
      return;
    }
    void send({
      activeThreadId: pending.threadId,
      docContext: pending.page,
      keepDraft: true,
      text: pending.contentTex,
      quote: pending.quote,
    });
  }, [activeThreadId, clear, draft, pending, quote, ready, send]);
};

/** A login that interrupted a question resumes it once the panel shows a signed-in, idle thread. */
export const canResumeLogin = (
  {
    auth,
    isOpen,
  }: {
    readonly auth: ReturnType<typeof useChatAuthState>;
    readonly isOpen: boolean;
  },
  thr: ReturnType<typeof useThreadState>,
): boolean =>
  isOpen &&
  auth.user !== null &&
  auth.block === null &&
  !thr.isThreadLoading &&
  !thr.isThreadFailed &&
  !thr.isStreaming;
