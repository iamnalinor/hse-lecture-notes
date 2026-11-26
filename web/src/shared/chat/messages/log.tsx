import { useLayoutEffect, useRef } from "react";

import { type ChatThreadSummary, threadDisplayTitle } from "#web/domain/chat/model.ts";

import { AlertIcon } from "../icons.tsx";
import { ChatEmptyView } from "../panel/parts.tsx";
import { useChat } from "../session/context.tsx";
import { ChatMessageView } from "./message-view.tsx";
import { ChatSkeleton } from "./skeleton.tsx";

const EarlierMessagesButton = () => {
  const chat = useChat();
  const anchorRef = useRef<null | { element: Element; top: number }>(null);
  const first = chat.messages[0]?.id;
  useLayoutEffect(() => {
    const snapshot = anchorRef.current;
    if (snapshot === null || chat.earlierStatus === "loading") {
      return;
    }
    anchorRef.current = null;
    const scroll = snapshot.element.closest(".ai-scroll");
    if (scroll !== null && snapshot.element.isConnected) {
      scroll.scrollTop += snapshot.element.getBoundingClientRect().top - snapshot.top;
    }
  }, [first, chat.earlierStatus]);
  if (!chat.hasEarlier) {
    return null;
  }
  return (
    <button
      className="mx-auto block underline"
      disabled={chat.earlierStatus === "loading"}
      onClick={(event) => {
        const element = event.currentTarget.parentElement?.querySelector(".ai-msg");
        if (element !== undefined && element !== null) {
          anchorRef.current = { element, top: element.getBoundingClientRect().top };
        }
        void chat.loadEarlier();
      }}
      type="button"
    >
      {chat.earlierStatus === "error"
        ? "Повторить загрузку предыдущих сообщений"
        : "Показать предыдущие сообщения"}
    </button>
  );
};

const ThreadLoadError = ({ failed }: { readonly failed: ChatThreadSummary }) => {
  const chat = useChat();
  const open = chat.threads.find((thread) => thread.id === chat.activeThreadId);
  return (
    <div className="ai-plate ai-fade" role="alert">
      <div className="ai-plate-row">
        <AlertIcon />
        <div>
          <b>{`Не удалось открыть «${threadDisplayTitle(failed)}»`}</b>
          <p>
            {chat.activeThreadId === null
              ? "Сейчас открыт новый чат, сообщение уйдет в него."
              : `Сейчас открыта «${threadDisplayTitle(open)}», сообщение уйдет в нее.`}
          </p>
        </div>
      </div>
      <div className="ai-plate-actions">
        <button
          className="ai-btn ai-btn-2"
          onClick={() => {
            chat.selectThread(failed.id);
          }}
          type="button"
        >
          Повторить
        </button>
      </div>
    </div>
  );
};

export const ChatLog = ({
  onJumpToBlock,
}: {
  readonly onJumpToBlock: (target: string) => void;
}) => {
  const chat = useChat();
  if (chat.isThreadLoading) {
    return <ChatSkeleton />;
  }
  const failure =
    chat.failedThread === null ? null : <ThreadLoadError failed={chat.failedThread} />;
  if (chat.messages.length === 0) {
    return (
      <>
        {failure}
        <ChatEmptyView />
      </>
    );
  }
  const last = chat.messages.at(-1);
  const canRetry =
    !chat.isStreaming &&
    (last?.role === "user"
      ? last.status === "error" && chat.block === null
      : chat.messages.at(-2)?.role === "user");
  return (
    <>
      {failure}
      <EarlierMessagesButton />
      {chat.messages.map((message) => (
        <ChatMessageView
          canRetry={canRetry && message === last}
          isBackgroundResponse={chat.isStreaming && !chat.canStop && message === last}
          isCheckingBrowser={chat.isCheckingBrowser && message === last}
          isRetrying={chat.isStreaming && message === last && message.status === "error"}
          key={message.renderKey ?? message.id}
          message={message}
          onJumpToBlock={onJumpToBlock}
          onRetry={(msgId) => {
            void chat.retryMessage(msgId);
          }}
        />
      ))}
    </>
  );
};
