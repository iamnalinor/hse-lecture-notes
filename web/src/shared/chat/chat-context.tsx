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

import { useChatSendActions, useComposerDraft } from "./use-chat-send-actions.ts";
import {
  useChatAuthState,
  useRootOpenClassSync,
  useTelegramAuthActions,
  useThreadState,
} from "./use-chat-state.ts";
import { type StreamStateSetters, useChatStream } from "./use-chat-stream.ts";

export const TURNSTILE_HOST_ID = "hse-turnstile-host";

export type ChatContextValue = {
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
  readonly isConfigured: boolean;
  readonly isLoginBusy: boolean;
  readonly isOpen: boolean;
  readonly isStreaming: boolean;
  readonly isThreadLoading: boolean;
  readonly login: () => Promise<void>;
  readonly messages: readonly ChatMessage[];
  readonly newChat: () => void;
  readonly openWithQuote: (quote: ChatQuote) => void;
  readonly previousThreadId: null | string;
  readonly quote: ChatQuote | null;
  readonly rateLimitUntil: number;
  readonly restorePreviousThread: () => void;
  readonly retryMessage: (assistantMsgId: string) => Promise<void>;
  readonly selectThread: (threadId: string) => void;
  readonly send: (overrideText?: string) => Promise<void>;
  readonly setDraft: (value: string) => void;
  readonly stop: () => void;
  readonly switchAccount: () => Promise<void>;
  readonly threads: readonly ChatThreadSummary[];
  readonly tier: ChatTier;
  readonly toggle: () => void;
  readonly turnstileOpen: boolean;
  readonly user: ChatUser | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

type BuildCtxArgs = {
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly docContext: ChatDocContext;
  readonly draft: string;
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
    a.setIsOpen(false);
  },
  degraded: a.auth.degraded,
  docContext: a.docContext,
  draft: a.draft,
  isConfigured: a.isConfigured,
  isLoginBusy: a.tgAuth.isLoginBusy,
  isOpen: a.isOpen,
  isStreaming: a.thr.isStreaming,
  isThreadLoading: a.thr.isThreadLoading,
  login: a.tgAuth.login,
  messages: a.thr.messages,
  newChat: () => {
    if (a.thr.isStreaming) {
      return;
    }
    a.thr.invalidateLoad();
    if (a.thr.activeThreadId !== null) {
      a.thr.setPreviousThreadId(a.thr.activeThreadId);
    }
    a.thr.setActiveThreadId(null);
    a.thr.setMessages([]);
  },
  openWithQuote: (nextQuote: ChatQuote) => {
    a.setQuote(nextQuote);
    a.setIsOpen(true);
  },
  previousThreadId: a.thr.previousThreadId,
  quote: a.quote,
  rateLimitUntil: a.auth.rateLimitUntil,
  restorePreviousThread: () => {
    if (a.thr.isStreaming || a.thr.previousThreadId === null) {
      return;
    }
    const target = a.thr.previousThreadId;
    a.thr.setPreviousThreadId(null);
    void a.thr.loadThread(a.docContext, target);
  },
  retryMessage: a.retryMessage,
  selectThread: (threadId: string) => {
    if (a.thr.isStreaming) {
      return;
    }
    a.thr.setPreviousThreadId(null);
    void a.thr.loadThread(a.docContext, threadId);
  },
  send: a.send,
  setDraft: a.setDraft,
  stop: a.stop,
  switchAccount: a.tgAuth.switchAccount,
  threads: a.thr.threads,
  tier: a.auth.tier,
  toggle: () => {
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
  const { draft, setDraft, quote, setQuote } = composer;

  const thr = useThreadState(docContext, isOpen, isConfigured);
  useRootOpenClassSync(isOpen);

  const setters: StreamStateSetters = {
    setPollRunId: thr.setPollRunId,
    setActiveThreadId: thr.setActiveThreadId,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setDraft,
    setIsStreaming: thr.setIsStreaming,
    setMessages: thr.setMessages,
    setPreviousThreadId: thr.setPreviousThreadId,
    setQuote,
    setThreads: thr.setThreads,
    setTier: auth.setTier,
    setUser: auth.setUser,
  };

  const stream = useChatStream(setters, turnstileHooks);
  const actions = useChatSendActions({ docContext, draft, quote, stream, thr });

  return buildContextValue({
    auth,
    docContext,
    draft,
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
  const [turnstileOpen, setTurnstileOpen] = useState(false);
  const turnstileHooks = useMemo<TurnstileHooks>(
    () => ({
      getContainer: () => document.querySelector<HTMLElement>(`#${TURNSTILE_HOST_ID}`),
      onInteractiveClose: () => {
        setTurnstileOpen(false);
      },
      onInteractiveOpen: () => {
        setTurnstileOpen(true);
      },
    }),
    [],
  );

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
    <ChatDocSessionProvider
      auth={auth}
      composer={composer}
      docContext={docContext}
      isOpen={isOpen}
      key={`${docKey}:${auth.user?.id ?? "guest"}`}
      setIsOpen={setIsOpen}
      tgAuth={tgAuth}
      turnstileHooks={turnstileHooks}
      turnstileOpen={turnstileOpen}
    >
      {children}
    </ChatDocSessionProvider>
  );
};

export const useChat = (): ChatContextValue => {
  const ctx = use(ChatContext);
  if (ctx === null) {
    throw new Error("useChat must be used inside ChatProvider");
  }
  return ctx;
};
