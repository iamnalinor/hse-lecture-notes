import { type JSX, useMemo } from "react";

import { type ChatMessage, toPlainCopyText } from "#web/domain/chat/model.ts";
import { paths } from "#web/domain/paths.ts";

import { AlertIcon, CheckIcon, CopyIcon, RetryIcon } from "../icons.tsx";
import { useCopyFeedback } from "../session/use-state.ts";
import { isMaterialLink } from "./markdown-parse.ts";
import { ChatMarkdown, InlineTeX, MessageMaterialPathContext } from "./markdown.tsx";
import { ChatQuoteCard } from "./quote-card.tsx";
import { ChatStepsBlock } from "./steps.tsx";

const RetryAnswerButton = ({ onRetry }: { readonly onRetry: () => void }) => (
  <button className="ai-btn ai-btn-2" onClick={onRetry} type="button">
    <RetryIcon />
    Повторить
  </button>
);

type FootActionsProps = {
  readonly isStopped: boolean;
  readonly contentTex: string;
  readonly canRetry: boolean;
  readonly onRetry: () => void;
};

const CopyAnswerButton = ({ contentTex }: Pick<FootActionsProps, "contentTex">): JSX.Element => {
  const { copyText, isCopied } = useCopyFeedback();

  return (
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
  );
};

const AssistantFootActions = ({
  contentTex,
  canRetry,
  isStopped,
  onRetry,
}: FootActionsProps): JSX.Element => (
  <div className="ai-foot ai-flow">
    <div className={isStopped ? "ai-actions ai-actions-stopped" : "ai-actions"}>
      {canRetry && isStopped && <RetryAnswerButton onRetry={onRetry} />}
      {contentTex !== "" && <CopyAnswerButton contentTex={contentTex} />}
      {canRetry && !isStopped && (
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

type Props = {
  readonly canRetry: boolean;
  /** The retry of this failed answer is waiting for the server. */
  readonly isRetrying?: boolean | undefined;
  readonly isCheckingBrowser?: boolean;
  readonly isBackgroundResponse?: boolean;
  readonly message: ChatMessage;
  readonly onJumpToBlock: (blockId: string) => void;
  readonly onRetry: (messageId: string) => void;
};

const UserMessageView = ({
  message,
  onJumpToBlock,
  canRetry,
  onRetry,
}: Pick<Props, "canRetry" | "message" | "onJumpToBlock" | "onRetry">): JSX.Element => {
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
          {canRetry && (
            <button
              className="ai-unsent-retry"
              onClick={() => {
                onRetry(message.id);
              }}
              type="button"
            >
              {message.errorMessage === null ? "Повторить" : "Редактировать"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const MessageError = ({
  message,
  canRetry,
  isRetrying,
  onRetry,
}: Pick<Props, "canRetry" | "isRetrying" | "message"> & { onRetry: () => void }): JSX.Element => (
  <div className="ai-error">
    <div className="ai-error-row">
      <AlertIcon />
      <div>
        Не удалось получить ответ
        <div className="ai-error-detail">
          {message.errorMessage ?? "Не удалось завершить запрос. Попробуй еще раз."}
        </div>
      </div>
    </div>
    {isRetrying === true ? (
      <button aria-busy="true" className="ai-btn ai-btn-2" disabled type="button">
        <span aria-hidden="true" className="ai-spin" />
        Повторяем…
      </button>
    ) : (
      canRetry && <RetryAnswerButton onRetry={onRetry} />
    )}
  </div>
);

const interruptedCaption = ({ status, errorMessage }: ChatMessage): null | string => {
  if (status === "stopped") {
    return "Ты остановил ответ";
  }
  return status === "incomplete" ? (errorMessage ?? "Ответ не завершен") : null;
};

const AssistantContent = ({
  message,
  canRetry,
  isRetrying,
  onRetry,
  onJumpToBlock,
}: Pick<Props, "canRetry" | "isRetrying" | "message" | "onJumpToBlock"> & {
  onRetry: () => void;
}): JSX.Element | null => {
  if (
    message.status === "error" ||
    (message.status === "incomplete" && message.contentTex === "")
  ) {
    return (
      <MessageError
        canRetry={canRetry}
        isRetrying={isRetrying}
        message={message}
        onRetry={onRetry}
      />
    );
  }
  const caption = interruptedCaption(message);
  return (
    <>
      {message.contentTex !== "" && (
        <ChatMarkdown
          isStreaming={message.status === "running"}
          onJumpToBlock={onJumpToBlock}
          text={message.contentTex}
        />
      )}
      {(message.status === "done" || message.status === "running") &&
        message.errorMessage !== null && (
          <p className="ai-error-detail" role="status">
            {message.errorMessage}
          </p>
        )}
      {caption !== null && (
        <div className="ai-stopped ai-fade" role="status">
          {caption}
        </div>
      )}
    </>
  );
};

const AssistantMessageView = ({
  canRetry,
  isRetrying,
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
        isStopped={message.status === "stopped"}
        onJumpToBlock={onJumpToBlock}
        steps={message.steps}
      />
      <div className="ai-body ai-flow" data-answer-id={isFinished ? message.id : undefined}>
        <AssistantContent
          canRetry={canRetry}
          isRetrying={isRetrying}
          message={message}
          onJumpToBlock={onJumpToBlock}
          onRetry={retrySelf}
        />
      </div>
      {isFinished && (message.contentTex !== "" || (message.status === "stopped" && canRetry)) && (
        <AssistantFootActions
          canRetry={canRetry}
          contentTex={message.contentTex}
          isStopped={message.status === "stopped"}
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
        <UserMessageView {...props} onJumpToBlock={jump} />
      ) : (
        <AssistantMessageView {...props} onJumpToBlock={jump} />
      )}
    </MessageMaterialPathContext>
  );
};
