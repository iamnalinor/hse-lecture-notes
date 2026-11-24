import {
  createContext,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
  use,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router";

import { isChatConfigured } from "#web/api/chat-client.ts";
import { cancelActiveTurnstile, type TurnstileHooks } from "#web/api/chat-widgets.ts";
import {
  type ChatBlock,
  type ChatDegraded,
  type ChatDocContext,
  type ChatMessage,
  type ChatQuote,
  type ChatThreadSummary,
  type ChatTier,
  type ChatUser,
  parseDocContext,
} from "#web/domain/chat.ts";

import type { StreamStateSetters } from "./chat-stream-types.ts";

import { TurnstileModal } from "./turnstile-modal.tsx";
import { useChatSendActions, useComposerDraft } from "./use-chat-send-actions.ts";
import {
  useChatAuthState,
  useRootOpenClassSync,
  useTelegramAuthActions,
} from "./use-chat-state.ts";
import { useChatStream } from "./use-chat-stream.ts";
import { useThreadState } from "./use-thread-state.ts";
import { useTurnstile } from "./use-turnstile.ts";

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

const ChatContext = createContext<ChatContextValue | null>(null);

type BuildCtxArgs = {
  readonly unsent: ChatMessage | null;
  readonly setUnsent: (message: ChatMessage | null) => void;
  readonly detach: () => void;
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly docContext: ChatDocContext;
  readonly draft: string;
  readonly isCheckingBrowser: boolean;
  readonly isConfigured: boolean;
  readonly isOpen: boolean;
  readonly quote: ChatQuote | null;
  readonly retryMessage: (assistantMsgId: string) => Promise<void>;
  readonly send: (overrideText?: string) => Promise<void>;
  readonly setDraft: (value: string) => void;
  readonly setIsOpen: Dispatch<SetStateAction<boolean>>;
  readonly setQuote: (value: ChatQuote | null) => void;
  readonly stop: () => void;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly thr: ReturnType<typeof useThreadState>;
  readonly turnstileOpen: boolean;
};

const buildContextValue = (a: BuildCtxArgs): ChatContextValue => ({
  activeThreadId: a.thr.activeThreadId,
  contextLimited:
    a.thr.threads.find((thread) => thread.id === a.thr.activeThreadId)?.contextLimited === true,
  block: a.auth.block,
  cancelTurnstile: cancelActiveTurnstile,
  canStop: a.thr.canStop,
  clearBlock: () => {
    a.auth.setBlock(null);
  },
  clearQuote: () => {
    a.setQuote(null);
  },
  close: () => {
    cancelActiveTurnstile();
    a.setIsOpen(false);
  },
  degraded: a.auth.degraded,
  docContext: a.docContext,
  draft: a.draft,
  isCheckingBrowser: a.isCheckingBrowser,
  isConfigured: a.isConfigured,
  isLoginBusy: a.tgAuth.isLoginBusy,
  isOpen: a.isOpen,
  isStreaming: a.thr.isStreaming,
  isThreadLoading: a.thr.isThreadLoading,
  login: a.tgAuth.login,
  messages: a.unsent === null ? a.thr.messages : [...a.thr.messages, a.unsent],
  newChat: () => {
    a.setUnsent(null);
    a.detach();
    a.thr.invalidateLoad();
    a.thr.setPollRunId(null);
    a.thr.setIsStreaming(false);
    if (a.quote?.messageId !== undefined) {
      a.setQuote(null);
    }
    a.thr.setActiveThreadId(null);
    a.thr.setMessages([]);
  },
  openWithQuote: (nextQuote: ChatQuote) => {
    a.setQuote(nextQuote);
    a.setIsOpen(true);
  },
  quote: a.quote,
  rateLimitUntil: a.auth.rateLimitUntil,
  retryMessage: a.retryMessage,
  selectThread: (threadId: string) => {
    if (a.thr.activeThreadId === threadId && !a.thr.isThreadLoading) {
      return;
    }
    a.setUnsent(null);
    a.detach();
    if (a.quote?.messageId !== undefined) {
      a.setQuote(null);
    }
    void a.thr.loadThread(threadId);
  },
  send: a.send,
  setDraft: a.setDraft,
  stop: a.stop,
  switchAccount: a.tgAuth.switchAccount,
  threads: a.thr.threads,
  loadMore: a.thr.loadMore,
  moreError: a.thr.moreError,
  hasMore: a.thr.hasMore,
  isLoadingMore: a.thr.isLoadingMore,
  tier: a.auth.tier,
  toggle: () => {
    if (a.isOpen) {
      cancelActiveTurnstile();
    }
    a.setIsOpen((prev) => !prev);
  },
  turnstileOpen: a.turnstileOpen,
  user: a.auth.user,
});

type SessionProps = {
  readonly composer: ReturnType<typeof useComposerDraft>;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly turnstileHooks: TurnstileHooks;
  readonly turnstileOpen: boolean;
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly docContext: ChatDocContext;
  readonly isOpen: boolean;
  readonly setIsOpen: Dispatch<SetStateAction<boolean>>;
};

const useChatSessionValue = ({
  auth,
  composer,
  docContext,
  isOpen,
  setIsOpen,
  tgAuth,
  turnstileHooks,
  turnstileOpen,
}: SessionProps): ChatContextValue => {
  const isConfigured = isChatConfigured();
  const { draft, setDraft, quote, setQuote, unsent, setUnsent } = composer;

  const { pathname } = useLocation();
  const pageKey = `${auth.user?.id ?? "guest"}:/${pathname.split("/").filter(Boolean).join("/")}`;
  const thr = useThreadState(isOpen, isConfigured, pageKey);

  const setters: StreamStateSetters = {
    setUnsent,
    setPollRunId: thr.setPollRunId,
    setActiveThreadId: thr.setActiveThreadId,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setDraft,
    setIsStreaming: thr.setIsStreaming,
    setMessages: thr.setMessages,
    setQuote,
    setThreads: thr.setThreads,
    setTier: auth.setTier,
    setUser: auth.setUser,
  };

  const stream = useChatStream(setters, turnstileHooks);
  const actions = useChatSendActions({ docContext, draft, quote, stream, thr });

  return buildContextValue({
    unsent,
    setUnsent,
    detach: stream.detachActive,
    auth,
    docContext,
    draft,
    isCheckingBrowser: stream.isCheckingBrowser,
    isConfigured,
    isOpen,
    quote,
    retryMessage: actions.retryMessage,
    send: actions.send,
    setDraft,
    setIsOpen,
    setQuote,
    stop: stream.stopActive,
    tgAuth,
    thr,
    turnstileOpen,
  });
};

type InnerProps = {
  readonly children: ReactNode;
  readonly docContext: ChatDocContext;
};

const ChatDocSessionProvider = ({ children, ...props }: InnerProps & SessionProps): JSX.Element => {
  const value = useChatSessionValue(props);
  return <ChatContext value={value}>{children}</ChatContext>;
};

export const ChatProvider = ({
  children,
  general = false,
}: {
  readonly children: ReactNode;
  readonly general?: boolean;
}): JSX.Element => {
  const location = useLocation();
  const auth = useChatAuthState();
  const [isOpen, setIsOpen] = useState(false);
  useRootOpenClassSync(isOpen);
  const { turnstileHooks, turnstileOpen } = useTurnstile(isOpen);

  const docContext = useMemo(
    () => parseDocContext(general ? "/" : location.pathname),
    [general, location.pathname],
  );
  const docKey = `${docContext.course}:${docContext.docId}`;
  const composer = useComposerDraft(docKey, auth.user);
  const tgAuth = useTelegramAuthActions({
    onLogin: composer.onLogin,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setTier: auth.setTier,
    setUser: auth.setUser,
    turnstileHooks,
  });
  return (
    <>
      <ChatDocSessionProvider
        auth={auth}
        composer={composer}
        docContext={docContext}
        isOpen={isOpen}
        key={auth.user?.id ?? "guest"}
        setIsOpen={setIsOpen}
        tgAuth={tgAuth}
        turnstileHooks={turnstileHooks}
        turnstileOpen={turnstileOpen}
      >
        {children}
      </ChatDocSessionProvider>
      {isChatConfigured() && (
        <TurnstileModal cancelTurnstile={cancelActiveTurnstile} turnstileOpen={turnstileOpen} />
      )}
    </>
  );
};

export const useChat = (): ChatContextValue => {
  const ctx = use(ChatContext);
  if (ctx === null) {
    throw new Error("useChat must be used inside ChatProvider");
  }
  return ctx;
};
