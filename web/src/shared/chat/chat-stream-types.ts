import type {
  ChatDocContext,
  ChatMessage,
  ChatQuote,
  ChatThreadSummary,
} from "#web/domain/chat.ts";

import type { AllowanceSetters } from "./chat-allowance.ts";

export type StreamStateSetters = AllowanceSetters & {
  readonly setUnsent: (message: ChatMessage | null) => void;
  readonly setPollRunId: (id: null | string) => void;
  readonly setActiveThreadId: (id: null | string) => void;
  readonly setDraft: (text: string) => void;
  readonly setIsStreaming: (isStreaming: boolean) => void;
  readonly setMessages: (updater: (prev: readonly ChatMessage[]) => readonly ChatMessage[]) => void;
  readonly setQuote: (quote: ChatQuote | null) => void;
  readonly setThreads: (
    updater: (prev: readonly ChatThreadSummary[]) => readonly ChatThreadSummary[],
  ) => void;
};

export type SendArgs = {
  readonly activeThreadId: null | string;
  readonly docContext: ChatDocContext;
  readonly quote: ChatQuote | null;
  readonly retryMessage?: ChatMessage;
  readonly text: string;
};
