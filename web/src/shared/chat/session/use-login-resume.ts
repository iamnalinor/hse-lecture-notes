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
    if (
      draft !== pending.contentTex ||
      quote !== pending.quote ||
      activeThreadId !== pending.threadId
    ) {
      return;
    }
    void send({
      activeThreadId: pending.threadId,
      docContext: pending.page,
      text: pending.contentTex,
      quote: pending.quote,
    });
  }, [activeThreadId, clear, draft, pending, quote, ready, send]);
};
