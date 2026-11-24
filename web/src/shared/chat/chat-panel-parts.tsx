import type { JSX } from "react";

import { createPortal } from "react-dom";

import { getLectureSuggestions } from "#web/domain/chat.ts";

import { TURNSTILE_HOST_ID, useChat } from "./chat-context.tsx";
import {
  ArrowRightIcon,
  CloseIcon,
  HistoryIcon,
  NewChatIcon,
  SparklesIcon,
  TelegramIcon,
} from "./chat-icons.tsx";

export const TurnstileModal = (): JSX.Element => {
  const { cancelTurnstile, turnstileOpen } = useChat();

  return createPortal(
    <div
      className={turnstileOpen ? "ai-modal is-on" : "ai-modal-hidden"}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          cancelTurnstile();
        }
      }}
      onKeyDown={undefined}
      role="presentation"
    >
      <div aria-labelledby="ai-ts-title" aria-modal="true" className="ai-modal-card" role="dialog">
        <button
          aria-label="Закрыть"
          className="ai-icon-btn ai-modal-x"
          onClick={cancelTurnstile}
          type="button"
        >
          <CloseIcon />
        </button>
        <h2 id="ai-ts-title">Подтвердите, что вы не бот</h2>
        <div id={TURNSTILE_HOST_ID} />
      </div>
    </div>,
    document.body,
  );
};

type PanelHeaderProps = {
  readonly historyOpen: boolean;
  readonly onClose: () => void;
  readonly onToggleHistory: () => void;
};

export const ChatPanelHeader = ({
  historyOpen,
  onClose,
  onToggleHistory,
}: PanelHeaderProps): JSX.Element => {
  const chat = useChat();
  return (
    <div className="ai-top">
      <div className="ai-title">
        <SparklesIcon />
        <span>Чат</span>
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
      <button
        aria-label="Закрыть чат"
        className="ai-icon-btn"
        onClick={onClose}
        title="Закрыть (Esc)"
        type="button"
      >
        <CloseIcon />
      </button>
      {historyOpen && chat.threads.length > 0 && (
        <div className="ai-hist-menu ai-fade">
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
        </div>
      )}
    </div>
  );
};

export const ChatEmptyView = (): JSX.Element => {
  const { docContext, previousThreadId, quote, restorePreviousThread, send } = useChat();
  const suggestions = getLectureSuggestions(docContext);
  let title = "Чат по конспектам";
  if (docContext.docId !== "") {
    title = "Вопрос по материалу";
  } else if (docContext.course !== "") {
    title = "Вопрос по курсу";
  }

  return (
    <div className="ai-empty ai-enter">
      {previousThreadId !== null && (
        <div className="ai-undo">
          Диалог очищен.{" "}
          <button onClick={restorePreviousThread} type="button">
            Вернуть
          </button>
        </div>
      )}
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
    </div>
  );
};
