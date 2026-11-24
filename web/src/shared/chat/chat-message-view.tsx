import { type JSX, useMemo } from "react";

import { type ChatMessage, toPlainCopyText } from "#web/domain/chat.ts";
import { paths } from "#web/domain/paths.ts";

import { AlertIcon, CheckIcon, CopyIcon, RetryIcon } from "./chat-icons.tsx";
import { isMaterialLink } from "./chat-markdown-parse.ts";
import { ChatMarkdown, InlineTeX, MessageMaterialPathContext } from "./chat-markdown.tsx";
import { ChatQuoteCard } from "./chat-quote-card.tsx";
import { ChatStepsBlock } from "./chat-steps.tsx";
import { useCopyFeedback } from "./use-chat-state.ts";

type FootActionsProps = {
  readonly contentTex: string;
  readonly canRetry: boolean;
  readonly onRetry: () => void;
};

const AssistantFootActions = ({ contentTex, canRetry, onRetry }: FootActionsProps): JSX.Element => {
  const { copyText, isCopied } = useCopyFeedback();

  return (
    <div className="ai-foot ai-flow">
      <div className="ai-actions">
        <span className={isCopied ? "ai-copy is-done" : "ai-copy"}>
          <button
            aria-label="Скопировать ответ"
            className="ai-icon-btn"
            onClick={() => {
              void copyText(toPlainCopyText(contentTex));
            }}
            title="Скопировать"
            type="button"
          >
            <span className="ai-ico-swap">
              <CopyIcon />
              <CheckIcon />
            </span>
          </button>
          <span aria-hidden="true" className="ai-tip">
            Скопировано
          </span>
        </span>
        {canRetry && (
          <button
            aria-label="Ответить заново"
            className="ai-icon-btn"
            onClick={onRetry}
            title="Ответить заново"
            type="button"
          >
            <RetryIcon />
          </button>
        )}
      </div>
    </div>
  );
};

type Props = {
  readonly canRetry: boolean;
  readonly isCheckingBrowser?: boolean;
  readonly isBackgroundResponse?: boolean;
  readonly message: ChatMessage;
  readonly onJumpToBlock: (blockId: string) => void;
  readonly onRetry: (messageId: string) => void;
};

const UserMessageView = ({
  message,
  onJumpToBlock,
}: Pick<Props, "message" | "onJumpToBlock">): JSX.Element => {
  const { quote } = message;
  const blockId = quote?.blockId;
  return (
    <div className="ai-msg ai-user ai-enter">
      {quote !== null && (
        <ChatQuoteCard
          onClick={
            blockId === undefined
              ? undefined
              : () => {
                  onJumpToBlock(blockId);
                }
          }
          quote={quote}
        />
      )}
      <div className="ai-bubble">
        <InlineTeX text={message.contentTex} />
      </div>
      {message.status === "error" && (
        <div className="ai-unsent" role="status">
          Не отправлено
        </div>
      )}
    </div>
  );
};

const MessageError = ({
  message,
  canRetry,
  onRetry,
}: Pick<Props, "canRetry" | "message"> & { onRetry: () => void }): JSX.Element => (
  <div className="ai-error">
    <div className="ai-error-row">
      <AlertIcon />
      <div>
        Не удалось получить ответ
        <div className="ai-error-detail">
          {message.errorMessage ?? "Сервер не ответил вовремя. Попробуйте ещё раз."}
        </div>
      </div>
    </div>
    {canRetry && (
      <button className="ai-btn ai-btn-2" onClick={onRetry} type="button">
        <RetryIcon />
        Повторить
      </button>
    )}
  </div>
);

const AssistantMessageView = ({
  canRetry,
  isCheckingBrowser,
  isBackgroundResponse,
  message,
  onJumpToBlock,
  onRetry,
}: Props): JSX.Element => {
  const isRunningSteps =
    message.status === "running" && (message.contentTex === "" || isBackgroundResponse === true);
  const isStopped = message.status === "stopped" || message.status === "incomplete";
  const isFinished = message.status === "done" || isStopped;
  const retrySelf = (): void => {
    onRetry(message.id);
  };

  return (
    <div className="ai-msg ai-asst ai-enter">
      <ChatStepsBlock
        isBackgroundResponse={isBackgroundResponse === true}
        isCheckingBrowser={isCheckingBrowser === true}
        isRunningSteps={isRunningSteps}
        onJumpToBlock={onJumpToBlock}
        steps={message.steps}
      />
      <div className="ai-body ai-flow" data-answer-id={isFinished ? message.id : undefined}>
        {message.status === "error" ? (
          <MessageError canRetry={canRetry} message={message} onRetry={retrySelf} />
        ) : (
          message.contentTex !== "" && (
            <>
              <ChatMarkdown
                isStreaming={message.status === "running"}
                onJumpToBlock={onJumpToBlock}
                text={message.contentTex}
              />
              {isStopped && <div className="ai-stopped ai-fade">Ответ остановлен</div>}
            </>
          )
        )}
      </div>
      {isFinished && (
        <AssistantFootActions
          canRetry={canRetry}
          contentTex={message.contentTex}
          onRetry={retrySelf}
        />
      )}
    </div>
  );
};

/** Exact `.ai-msg` user/assistant message view from prototype.html. */
export const ChatMessageView = (props: Props): JSX.Element => {
  const page = props.message.page;
  const path = useMemo(
    () => (page.docId === "" ? "" : paths.lecture(page.course, page.docId)),
    [page],
  );
  const jump = (target: string): void => {
    props.onJumpToBlock(path === "" || isMaterialLink(target) ? target : `${path}#${target}`);
  };
  return (
    <MessageMaterialPathContext value={path}>
      {props.message.role === "user" ? (
        <UserMessageView message={props.message} onJumpToBlock={jump} />
      ) : (
        <AssistantMessageView {...props} onJumpToBlock={jump} />
      )}
    </MessageMaterialPathContext>
  );
};
