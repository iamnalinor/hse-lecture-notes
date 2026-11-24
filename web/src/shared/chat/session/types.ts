import type {
  ChatBlock,
  ChatDegraded,
  ChatDocContext,
  ChatMessage,
  ChatQuote,
  ChatThreadSummary,
  ChatTier,
  ChatUser,
} from "#web/domain/chat/model.ts";

export type ChatContextValue = {
  readonly contextLimited?: boolean;
  readonly activeThreadId: null | string;
  readonly block: ChatBlock | null;
  readonly cancelTurnstile: () => void;
  readonly canStop: boolean;
  readonly clearBlock: () => void;
  readonly clearQuote: () => void;
  readonly close: () => void;
  readonly degraded: ChatDegraded;
  readonly docContext: ChatDocContext;
  readonly draft: string;
  readonly isCheckingBrowser: boolean;
  readonly isConfigured: boolean;
  readonly isLoginBusy: boolean;
  readonly isOpen: boolean;
  readonly isStreaming: boolean;
  readonly isThreadLoading: boolean;
  readonly login: () => Promise<void>;
  readonly messages: readonly ChatMessage[];
  readonly newChat: () => void;
  readonly openWithQuote: (quote: ChatQuote) => void;
  readonly quote: ChatQuote | null;
  readonly rateLimitUntil: number;
  readonly retryMessage: (assistantMsgId: string) => Promise<void>;
  readonly selectThread: (threadId: string) => void;
  readonly send: (overrideText?: string) => Promise<void>;
  readonly setDraft: (value: string) => void;
  readonly stop: () => void;
  readonly switchAccount: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
  readonly hasMore: boolean;
  readonly moreError: boolean;
  readonly isLoadingMore: boolean;
  readonly threads: readonly ChatThreadSummary[];
  readonly tier: ChatTier;
  readonly toggle: () => void;
  readonly turnstileOpen: boolean;
  readonly user: ChatUser | null;
};
