import { useChat } from "./chat-context.tsx";
import { ChatMessageView } from "./chat-message-view.tsx";
import { ChatEmptyView } from "./chat-panel-parts.tsx";
import { ChatSkeleton } from "./chat-skeleton.tsx";

export const ChatLog = ({
  onJumpToBlock,
}: {
  readonly onJumpToBlock: (target: string) => void;
}) => {
  const chat = useChat();
  if (chat.isThreadLoading) {
    return <ChatSkeleton />;
  }
  if (chat.messages.length === 0) {
    return <ChatEmptyView />;
  }
  const last = chat.messages.at(-1);
  const canRetry = !chat.isStreaming && chat.messages.at(-2)?.role === "user";
  return (
    <>
      {chat.messages.map((message) => (
        <ChatMessageView
          canRetry={canRetry && message === last}
          isBackgroundResponse={chat.isStreaming && !chat.canStop && message === last}
          isCheckingBrowser={chat.isCheckingBrowser && message === last}
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
