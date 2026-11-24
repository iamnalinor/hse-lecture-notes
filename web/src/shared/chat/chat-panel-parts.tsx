import { type JSX, useMemo } from "react";
import { useLocation } from "react-router";

import { getChatSuggestions } from "#web/domain/chat-suggestion-pools.ts";

import { useChat } from "./chat-context.tsx";
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
} from "./chat-icons.tsx";
import { useCopyFeedback } from "./use-chat-state.ts";

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
          disabled={chat.isStreaming}
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
          disabled={chat.isLoadingMore}
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

export const ChatPanelHeader = ({
  historyOpen,
  onClose,
  onToggleHistory,
}: PanelHeaderProps): JSX.Element => {
  const chat = useChat();
  const title = chat.threads.find((t) => t.id === chat.activeThreadId)?.generatedTitle ?? "Чат";
  return (
    <div className="ai-top">
      <div className="ai-title">
        <SparklesIcon />
        <span title={title}>{title}</span>
      </div>
      {chat.tier === "guest" && (
        <button
          className="ai-text-btn"
          disabled={chat.isLoginBusy}
          onClick={() => {
            void chat.login();
          }}
          type="button"
        >
          {chat.isLoginBusy ? <span className="ai-spin" /> : <TelegramIcon />}
          Войти
        </button>
      )}
      <button
        aria-label="Новый чат"
        className="ai-icon-btn"
        disabled={chat.isStreaming}
        hidden={chat.messages.length === 0}
        onClick={chat.newChat}
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
          disabled={chat.isStreaming}
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

/** «Отправьте ссылку агенту»: адрес открытой страницы, клик копирует. */
const AgentLinkCard = (): JSX.Element => {
  const { pathname } = useLocation();
  const { copyText, isCopied } = useCopyFeedback();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const url = `${globalThis.location.origin}${basePath}${pathname}`.replace(/\/$/u, "");

  return (
    <section aria-labelledby="ai-agent-title" className="ai-agent">
      <h3 id="ai-agent-title">Или отправьте ссылку своему агенту</h3>
      <p>Сайт адаптирован для ИИ: он прочитает эту страницу целиком.</p>
      <button
        aria-label={isCopied ? "Ссылка скопирована" : `Копировать ссылку ${url}`}
        className="ai-agent-link"
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
          <span aria-hidden="true" className="ai-tip">
            Скопировано
          </span>
        </span>
        <span className="ai-agent-url">{url}</span>
      </button>
    </section>
  );
};
