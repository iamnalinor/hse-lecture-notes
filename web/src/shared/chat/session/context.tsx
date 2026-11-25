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

import { isChatConfigured } from "#web/api/chat/client.ts";
import { cancelActiveTurnstile, type TurnstileHooks } from "#web/api/chat/widgets.ts";
import {
  type ChatDocContext,
  type ChatMessage,
  type ChatQuote,
  parseDocContext,
} from "#web/domain/chat/model.ts";

import type { StreamStateSetters, UnsentQuestion } from "../stream/types.ts";
import type { ChatContextValue } from "./types.ts";

import { setChatOpen, useIsChatOpen } from "../open-state.ts";
import { TurnstileModal } from "../panel/turnstile-modal.tsx";
import { useChatStream } from "../stream/use-stream.ts";
import { useLoginResume } from "./use-login-resume.ts";
import { useChatSendActions, useComposerDraft } from "./use-send-actions.ts";
import { useChatAuthState, useRootOpenClassSync, useTelegramAuthActions } from "./use-state.ts";
import { useThreadState } from "./use-thread-state.ts";
import { useTurnstile } from "./use-turnstile.ts";

const ChatContext = createContext<ChatContextValue | null>(null);

type BuildCtxArgs = {
  readonly unsent: ChatMessage | null;
  readonly setUnsent: (message: null | UnsentQuestion) => void;
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

const detachThread = (a: BuildCtxArgs): void => {
  a.setUnsent(null);
  a.detach();
  if (a.quote?.messageId !== undefined) {
    a.setQuote(null);
  }
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
  checkingLogin: a.tgAuth.checkingLogin,
  verificationError: a.tgAuth.verificationError,
  isOpen: a.isOpen,
  isStreaming: a.thr.isStreaming,
  isThreadLoading: a.thr.isThreadLoading,
  login: a.tgAuth.login,
  messages: a.unsent === null ? a.thr.messages : [...a.thr.messages, a.unsent],
  newChat: () => {
    detachThread(a);
    a.thr.invalidateLoad();
    a.thr.setPollRunId(null);
    a.thr.setIsStreaming(false);
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
    detachThread(a);
    void a.thr.loadThread(threadId);
  },
  send: a.send,
  setDraft: a.setDraft,
  stop: a.stop,
  switchAccount: a.tgAuth.switchAccount,
  threads: a.thr.threads,
  earlierStatus: a.thr.earlierStatus,
  hasEarlier: a.thr.hasEarlier,
  loadEarlier: a.thr.loadEarlier,
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

const streamSetters = (
  auth: SessionProps["auth"],
  composer: SessionProps["composer"],
  thr: ReturnType<typeof useThreadState>,
): StreamStateSetters => {
  return {
    restoreRejectedDraft: composer.restoreRejectedDraft,
    setUnsent: composer.setUnsent,
    setPollRunId: thr.setPollRunId,
    setActiveThreadId: thr.setActiveThreadId,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setDraft: composer.setDraft,
    setIsStreaming: thr.setIsStreaming,
    setMessages: thr.setMessages,
    setQuote: composer.setQuote,
    setThreads: thr.setThreads,
    setTier: auth.setTier,
    setUser: auth.setUser,
  };
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
  const thr = useThreadState({
    isOpen,
    isConfigured,
    pageKey,
    preferredThreadId: composer.resume?.threadId,
  });

  const setters = streamSetters(auth, composer, thr);
  const stream = useChatStream(setters, turnstileHooks);
  const actions = useChatSendActions({
    docContext,
    draft,
    quote,
    stream,
    thr,
    unsent,
    block: auth.block,
    tgAuth,
  });
  useLoginResume({
    pending: composer.resume,
    ready:
      isOpen &&
      !tgAuth.checkingLogin &&
      !tgAuth.verificationError &&
      auth.user !== null &&
      auth.block === null &&
      !thr.isThreadLoading &&
      !thr.isStreaming,
    draft,
    quote,
    activeThreadId: thr.activeThreadId,
    clear: composer.clearResume,
    send: stream.sendQuestion,
  });

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
    ...actions,
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
  sharedOpen = false,
}: {
  readonly children: ReactNode;
  readonly general?: boolean;
  readonly sharedOpen?: boolean;
}): JSX.Element => {
  const location = useLocation();
  const auth = useChatAuthState();
  const [localOpen, setLocalOpen] = useState(false);
  const isShared = useIsChatOpen();
  const isOpen = sharedOpen ? isShared : localOpen;
  const setIsOpen = sharedOpen ? setChatOpen : setLocalOpen;
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
