import {
  createContext,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
  use,
  useCallback,
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

import {
  useChatAuthState,
  useRootOpenClassSync,
  useTelegramAuthActions,
  useThreadState,
} from "./use-chat-state.ts";
import {
  type ChatStreamController,
  type StreamStateSetters,
  useChatStream,
} from "./use-chat-stream.ts";

export const TURNSTILE_HOST_ID = "hse-turnstile-host";

export type ChatContextValue = {
  readonly activeThreadId: null | string;
  readonly block: ChatBlock | null;
  readonly cancelTurnstile: () => void;
  readonly clearQuote: () => void;
  readonly close: () => void;
  readonly degraded: ChatDegraded;
  readonly docContext: ChatDocContext | null;
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

type SendHookDeps = {
  readonly docContext: ChatDocContext | null;
  readonly draft: string;
  readonly quote: ChatQuote | null;
  readonly stream: ChatStreamController;
  readonly thr: ReturnType<typeof useThreadState>;
};

const useChatSendActions = ({ docContext, draft, quote, stream, thr }: SendHookDeps) => {
  const retryMessage = useCallback(
    async (assistantMsgId: string): Promise<void> => {
      if (docContext === null || thr.isStreaming) {
        return;
      }
      const idx = thr.messages.findIndex((m) => m.id === assistantMsgId);
      const userMsg = idx > 0 ? thr.messages[idx - 1] : undefined;
      if (userMsg?.role !== "user") {
        return;
      }
      await stream.sendQuestion({
        activeThreadId: thr.activeThreadId,
        docContext,
        quote: userMsg.quote,
        retryAssistantMessageId: assistantMsgId,
        text: userMsg.contentTex,
      });
    },
    [docContext, stream, thr.activeThreadId, thr.isStreaming, thr.messages],
  );

  const send = useCallback(
    async (overrideText?: string): Promise<void> => {
      if (docContext === null || thr.isStreaming) {
        return;
      }
      const text = (overrideText ?? draft).trim();
      if (text === "" && quote === null) {
        return;
      }
      await stream.sendQuestion({ activeThreadId: thr.activeThreadId, docContext, quote, text });
    },
    [docContext, draft, quote, stream, thr.activeThreadId, thr.isStreaming],
  );

  return { retryMessage, send };
};

type BuildCtxArgs = {
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly docContext: ChatDocContext | null;
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
    if (a.docContext === null || a.thr.previousThreadId === null) {
      return;
    }
    const target = a.thr.previousThreadId;
    a.thr.setPreviousThreadId(null);
    void a.thr.loadThread(a.docContext, target);
  },
  retryMessage: a.retryMessage,
  selectThread: (threadId: string) => {
    if (a.docContext === null) {
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

const useChatSessionValue = (docContext: ChatDocContext | null): ChatContextValue => {
  const isConfigured = isChatConfigured();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<ChatQuote | null>(null);
  const [turnstileOpen, setTurnstileOpen] = useState(false);

  const auth = useChatAuthState();
  const thr = useThreadState(docContext, isOpen, isConfigured);
  useRootOpenClassSync(isOpen, docContext !== null);

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

  const setters = useMemo<StreamStateSetters>(
    () => ({
      loadThread: thr.loadThread,
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
    }),
    [auth, thr],
  );

  const stream = useChatStream(setters, turnstileHooks);
  const tgAuth = useTelegramAuthActions({
    activeThreadId: thr.activeThreadId,
    docContext,
    loadThread: thr.loadThread,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setTier: auth.setTier,
    setUser: auth.setUser,
    turnstileHooks,
  });
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
  readonly docContext: ChatDocContext | null;
};

const ChatDocSessionProvider = ({ children, docContext }: InnerProps): JSX.Element => {
  const value = useChatSessionValue(docContext);
  return <ChatContext value={value}>{children}</ChatContext>;
};

export const ChatProvider = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const location = useLocation();
  const docContext = useMemo(() => parseDocContext(location.pathname), [location.pathname]);
  const docKey = docContext === null ? "none" : `${docContext.course}:${docContext.docId}`;
  return (
    <ChatDocSessionProvider docContext={docContext} key={docKey}>
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
