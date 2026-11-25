import { useEffect, useRef } from "react";

import type { ChatQuote } from "#web/domain/chat/model.ts";

import type { SendArgs, UnsentQuestion } from "../stream/types.ts";

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
