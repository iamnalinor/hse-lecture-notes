import { useState } from "react";

import { parseChatSuggestion } from "#web/domain/chat/model.ts";

import type { ChatContextValue } from "../session/types.ts";

import { useChat } from "../session/context.tsx";

type Scope = { readonly scope: string; readonly key: string; readonly quoteKey: string };
const useConsumedSuggestions = (next: Scope) => {
  const [used, setUsed] = useState<readonly string[]>([]);
  const [observed, setObserved] = useState(next);
  if (observed.scope !== next.scope || observed.quoteKey !== next.quoteKey) {
    setObserved(next);
    if (observed.key !== "") {
      setUsed((previous) => [...previous, observed.key]);
    }
  } else if (observed.key !== next.key) {
    setObserved(next);
  }
  return {
    used,
    consume: () => {
      setUsed((previous) => [...previous, next.key]);
    },
  };
};

const resolveSuggestion = (chat: ChatContextValue): null | string => {
  if (
    chat.draft !== "" ||
    chat.quote !== null ||
    chat.isStreaming ||
    chat.isThreadLoading ||
    chat.isThreadFailed
  ) {
    return null;
  }
  const last = chat.messages.at(-1);
  return last?.role === "assistant" && last.status === "done"
    ? parseChatSuggestion(last.suggestion)
    : null;
};

export const useComposerSuggestion = () => {
  const chat = useChat();
  const last = chat.messages.at(-1);
  const scope = `${chat.user?.id ?? "guest"}:${chat.activeThreadId ?? "new"}`;
  const key = last === undefined ? "" : `${scope}:${last.id}:${last.runId ?? ""}`;
  const { used, consume } = useConsumedSuggestions({ scope, key, quoteKey: chat.quote?.tex ?? "" });
  return { suggestion: used.includes(key) ? null : resolveSuggestion(chat), consume };
};
