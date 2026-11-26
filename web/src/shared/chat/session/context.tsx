import {
  createContext,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
  use,
  useState,
} from "react";
import { useLocation } from "react-router";

import type { ChatDocContext, ChatMessage, ChatQuote } from "#web/domain/chat/model.ts";

import { isChatConfigured } from "#web/api/chat/client.ts";
import { cancelActiveTurnstile, type TurnstileHooks } from "#web/api/chat/widgets.ts";

import type { ChatContextValue } from "./types.ts";

import { useChatLaunch } from "../launch-store.ts";
import { setChatOpen, useIsChatOpen } from "../open-state.ts";
import { TurnstileModal } from "../panel/turnstile-modal.tsx";
import { useChatStream } from "../stream/use-stream.ts";
import { useRootOpenClassSync } from "../use-root-open-class.ts";
import {
  detachThread,
  isContextLimited,
  isShownAndLoaded,
  startFreshThread,
  startNewThread,
} from "./new-thread.ts";
import { streamSetters } from "./stream-setters.ts";
import { useComposerDrafts } from "./use-composer-drafts.ts";
import { canResumeLogin, useLoginResume } from "./use-login-resume.ts";
import { chatSendActions } from "./use-send-actions.ts";
import { useSourceReturn } from "./use-source-return.ts";
import { useChatAuthState, useTelegramAuthActions } from "./use-state.ts";
import { useThreadState } from "./use-thread-state.ts";
import { useTurnstile } from "./use-turnstile.ts";

const ChatContext = createContext<ChatContextValue | null>(null);

type BuildCtxArgs = Pick<
  ChatContextValue,
  "login" | "retryMessage" | "send" | "setDraft" | "stop"
> & {
  readonly unsent: ChatMessage | null;
  readonly leaveThread: (isNewChat: boolean) => void;
  readonly detach: () => void;
  /** Quote into the new chat the closed panel opens on (the draft of the page's «no thread yet»). */
  readonly setFreshQuote: (value: ChatQuote) => void;
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly docContext: ChatDocContext;
  readonly source: ReturnType<typeof useSourceReturn>;
  readonly draft: string;
  readonly draftError: null | string;
  readonly isCheckingBrowser: boolean;
  readonly isConfigured: boolean;
  readonly isOpen: boolean;
  readonly quote: ChatQuote | null;
  readonly setIsOpen: Dispatch<SetStateAction<boolean>>;
  readonly setQuote: (value: ChatQuote | null) => void;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly thr: ReturnType<typeof useThreadState>;
  readonly turnstileOpen: boolean;
};

const buildContextValue = (a: BuildCtxArgs): ChatContextValue => ({
  activeThreadId: a.thr.activeThreadId,
  contextLimited: isContextLimited(a.thr),
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
  closeForSource: () => {
    a.source.retainForSource();
    a.setIsOpen(false);
  },
  readingSource: a.source.readingSource,
  draftError: a.draftError,
  degraded: a.auth.degraded,
  maxQuestionChars: a.auth.maxQuestionChars,
  docContext: a.docContext,
  draft: a.draft,
  isCheckingBrowser: a.isCheckingBrowser,
  isConfigured: a.isConfigured,
  ...a.tgAuth,
  login: a.login,
  switchAccount: a.login,
  isOpen: a.isOpen,
  isStreaming: a.thr.isStreaming,
  isThreadFailed: a.thr.isThreadFailed,
  isThreadLoading: a.thr.isThreadLoading,
  messages: a.unsent === null ? a.thr.messages : [...a.thr.messages, a.unsent],
  newChat: () => {
    startNewThread(a, { isCancellingLoad: true });
  },
  openWithQuote: (nextQuote: ChatQuote) => {
    if (a.isOpen) {
      a.setQuote(nextQuote);
    } else {
      startFreshThread(a);
      a.setFreshQuote(nextQuote);
    }
    a.setIsOpen(true);
  },
  quote: a.quote,
  rateLimitUntil: a.auth.rateLimitUntil,
  retryMessage: a.retryMessage,
  retryThread: a.thr.retryThread,
  selectThread: (threadId: string) => {
    if (isShownAndLoaded(a.thr, threadId)) {
      return;
    }
    detachThread(a, false);
    a.thr.openThread(threadId);
  },
  send: a.send,
  setDraft: a.setDraft,
  stop: a.stop,
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
    a.setIsOpen((prev) => !prev);
  },
  turnstileOpen: a.turnstileOpen,
  user: a.auth.user,
});

type SessionProps = {
  readonly source: ReturnType<typeof useSourceReturn>;
  readonly drafts: ReturnType<typeof useComposerDrafts>;
  readonly tgAuth: ReturnType<typeof useTelegramAuthActions>;
  readonly turnstileHooks: TurnstileHooks;
  readonly turnstileOpen: boolean;
  readonly auth: ReturnType<typeof useChatAuthState>;
  readonly pageKey: string;
  readonly isOpen: boolean;
  readonly setIsOpen: Dispatch<SetStateAction<boolean>>;
};

const useChatSessionValue = ({
  auth,
  drafts,
  pageKey,
  source,
  isOpen,
  setIsOpen,
  tgAuth,
  turnstileHooks,
  turnstileOpen,
}: SessionProps): ChatContextValue => {
  const isConfigured = isChatConfigured();

  const userId = auth.user?.id;
  const thr = useThreadState({
    isOpen,
    isConfigured,
    pageKey,
    preferredThreadId: drafts.migration?.threadId,
    readingSource: source.readingSource,
  });

  const composer = drafts.forThread(thr.activeThreadId);
  const { text: draft, setDraft, quote, setQuote, unsent } = composer;
  const setters = streamSetters(auth, composer, thr);
  const stream = useChatStream(setters, turnstileHooks, userId);
  const actions = chatSendActions({
    docContext: source.composerDoc,
    draft,
    maxQuestionChars: auth.maxQuestionChars,
    editUnsent: composer.editUnsent,
    quote,
    stream,
    thr,
    unsent,
    block: auth.block,
    tgAuth,
  });
  useChatLaunch((request) => {
    startFreshThread({ detach: stream.detachActive, leaveThread: drafts.leaveThread, thr });
    drafts.forThread(null).setDraft(request.text);
  });
  useLoginResume({
    pending: drafts.migration?.resume ?? null,
    ready: canResumeLogin({ isOpen, auth }, thr),
    draft,
    quote,
    activeThreadId: thr.activeThreadId,
    clear: drafts.clearResume,
    send: stream.sendQuestion,
  });

  return buildContextValue({
    source,
    unsent,
    leaveThread: drafts.leaveThread,
    setFreshQuote: (value) => {
      drafts.forThread(null).setQuote(value);
    },
    draftError: composer.draftError,
    login: () => tgAuth.login(composer.onLogin),
    detach: stream.detachActive,
    auth,
    docContext: source.docContext,
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

const ChatDocSessionProvider = ({
  children,
  ...props
}: SessionProps & { readonly children: ReactNode }): JSX.Element => {
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
  const widgets = useTurnstile(isOpen);

  const owner = String(auth.user?.id ?? "guest");
  const source = useSourceReturn(location.pathname, owner, { isOpen, general });
  const drafts = useComposerDrafts(source.page, auth.user);
  const tgAuth = useTelegramAuthActions({
    ...widgets,
    setBlock: auth.setBlock,
    setDegraded: auth.setDegraded,
    setQuestionLimit: auth.setQuestionLimit,
    applyLogin: auth.applyLogin,
  });
  return (
    <>
      <ChatDocSessionProvider
        auth={auth}
        drafts={drafts}
        isOpen={isOpen}
        key={owner}
        pageKey={owner}
        setIsOpen={setIsOpen}
        source={source}
        tgAuth={tgAuth}
        turnstileHooks={widgets.turnstileHooks}
        turnstileOpen={widgets.turnstileOpen}
      >
        {children}
      </ChatDocSessionProvider>
      {isChatConfigured() && (
        <TurnstileModal
          cancelTurnstile={cancelActiveTurnstile}
          turnstileOpen={isOpen && widgets.turnstileOpen}
        />
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
