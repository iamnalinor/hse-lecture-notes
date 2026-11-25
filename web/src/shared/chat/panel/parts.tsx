import { type JSX, useMemo } from "react";
import { useLocation } from "react-router";

import { getChatSuggestions } from "#web/domain/chat/suggestion-pools.ts";

import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  HistoryIcon,
  NewChatIcon,
  SparklesIcon,
  TelegramIcon,
  TriangleExclamationPointIcon,
} from "../icons.tsx";
import { useChat } from "../session/context.tsx";
import { useCopyFeedback } from "../session/use-state.ts";
import { useHistoryDismiss } from "./use-history-dismiss.ts";

type PanelHeaderProps = {
  readonly historyOpen: boolean;
  readonly onClose: () => void;
  readonly onToggleHistory: () => void;
};

const HistoryMenu = ({
  onToggleHistory,
}: Pick<PanelHeaderProps, "onToggleHistory">): JSX.Element => {
  const chat = useChat();
  return (
    <div
      aria-label="История чатов"
      className="ai-hist-menu ai-fade"
      onScroll={({ currentTarget }) => {
        const { scrollHeight, scrollTop, clientHeight } = currentTarget;
        if (
          chat.hasMore &&
          !chat.isLoadingMore &&
          !chat.moreError &&
          scrollHeight - scrollTop - clientHeight <= 48
        ) {
          void chat.loadMore();
        }
      }}
      role="group"
    >
      {chat.threads.map((thread) => (
        <button
          className={thread.id === chat.activeThreadId ? "ai-hist-item is-on" : "ai-hist-item"}
          key={thread.id}
          onClick={() => {
            chat.selectThread(thread.id);
            onToggleHistory();
          }}
          type="button"
        >
          <span>{thread.title}</span>
        </button>
      ))}
      {chat.isLoadingMore && (
        <div className="ai-hist-loading" role="status">
          <span aria-hidden="true" className="ai-spin" /> Загружаем чаты…
        </div>
      )}
      {chat.moreError && (
        <button
          className="ai-hist-item ai-hist-retry"
          onClick={() => {
            void chat.loadMore();
          }}
          type="button"
        >
          <TriangleExclamationPointIcon />
          Повторить загрузку
        </button>
      )}
    </div>
  );
};

const LoginButton = () => {
  const chat = useChat();
  return (
    <button
      className="ai-text-btn"
      disabled={chat.isLoginBusy}
      onClick={() => {
        void chat.login();
      }}
      type="button"
    >
      {chat.isLoginBusy ? <span className="ai-spin" /> : <TelegramIcon />}
      {chat.telegramLoadFailed ? "Повторить загрузку Telegram" : "Войти"}
    </button>
  );
};

export const ChatPanelHeader = ({
  historyOpen,
  onClose,
  onToggleHistory,
}: PanelHeaderProps): JSX.Element => {
  const chat = useChat();
  const activeThread = chat.threads.find((t) => t.id === chat.activeThreadId);
  const title = activeThread?.generatedTitle ?? activeThread?.title ?? "Чат";
  const headerRef = useHistoryDismiss(historyOpen, onToggleHistory);
  return (
    <div className="ai-top" ref={headerRef}>
      <div className="ai-title">
        <SparklesIcon />
        <span title={title}>{title}</span>
      </div>
      {chat.user === null && <LoginButton />}
      <button
        aria-label="Новый чат"
        className="ai-icon-btn"
        hidden={chat.messages.length === 0}
        onClick={() => {
          chat.newChat();
          if (historyOpen) {
            onToggleHistory();
          }
        }}
        title="Новый чат"
        type="button"
      >
        <NewChatIcon />
      </button>
      {chat.threads.length > 0 && (
        <button
          aria-expanded={historyOpen}
          aria-label="История чатов"
          className="ai-icon-btn"
          data-history-trigger
          onClick={onToggleHistory}
          title="История чатов"
          type="button"
        >
          <HistoryIcon />
        </button>
      )}
      <button
        aria-label="Закрыть чат"
        className="ai-icon-btn"
        onClick={onClose}
        title="Закрыть (Esc)"
        type="button"
      >
        <CloseIcon />
      </button>
      {historyOpen && chat.threads.length > 0 && <HistoryMenu onToggleHistory={onToggleHistory} />}
    </div>
  );
};

export const ChatEmptyView = (): JSX.Element => {
  const { docContext, quote, send } = useChat();
  const { course, docId } = docContext;
  const suggestions = useMemo(() => getChatSuggestions({ course, docId }), [course, docId]);
  let title = "Чат по конспектам";
  if (docContext.docId !== "") {
    title = "Вопрос по материалу";
  } else if (docContext.course !== "") {
    title = "Вопрос по курсу";
  }

  return (
    <div className="ai-empty ai-enter">
      <h2>{title}</h2>
      {docContext.docId !== "" && <p>Выделите фрагмент материала, чтобы задать вопрос о нём.</p>}
      {quote === null && (
        <div className="ai-sugg">
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                void send(prompt);
                // The button goes away with the empty view: keep typing in the composer, as after opening.
                globalThis.requestAnimationFrame(() => {
                  document
                    .querySelector<HTMLTextAreaElement>("#ai-input")
                    ?.focus({ preventScroll: true });
                });
              }}
              type="button"
            >
              {prompt}
              <ArrowRightIcon />
            </button>
          ))}
        </div>
      )}
      <AgentLinkCard />
    </div>
  );
};

/** Ссылка на открытую страницу для чужого ИИ: подпись над полем и квадратная кнопка копирования, как в «Поделиться». */
const AgentLinkCard = (): JSX.Element => {
  const { pathname } = useLocation();
  const { copyText, isCopied } = useCopyFeedback();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const url = `${globalThis.location.origin}${basePath}${pathname}`.replace(/\/$/u, "");

  return (
    <section className="ai-agent">
      <span className="ai-agent-label" id="ai-agent-label">
        Ссылка для ChatGPT, Claude и других
      </span>
      <div aria-labelledby="ai-agent-label" className="ai-agent-field" role="group">
        {/* The feedback takes the address's place: a tip over the button would be cut by the field. */}
        <span className={isCopied ? "ai-agent-url is-done" : "ai-agent-url"} title={url}>
          {isCopied ? "Скопировано" : url}
        </span>
        <button
          aria-label={isCopied ? "Ссылка скопирована" : "Копировать ссылку"}
          className="ai-agent-copy"
          onClick={() => {
            void copyText(url);
          }}
          title="Копировать ссылку"
          type="button"
        >
          <span className={isCopied ? "ai-copy is-done" : "ai-copy"}>
            <span className="ai-ico-swap">
              <CopyIcon />
              <CheckIcon />
            </span>
          </span>
        </button>
      </div>
    </section>
  );
};
