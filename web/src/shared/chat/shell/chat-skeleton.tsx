import type { JSX } from "react";

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => (
    <span className="ai-sk-block ai-sk-line" key={index} />
  ));

/** The rhythm of a question and two answers; stands in for the log in the shell and while a thread loads. */
export const ChatMessagesSkeleton = (): JSX.Element => (
  <div aria-busy="true" className="ai-sk" role="status">
    <span className="sr-only">Загружаю чат</span>
    <div aria-hidden="true">
      <div className="ai-sk-user">
        <span className="ai-sk-block ai-sk-bubble" />
      </div>
      <div className="ai-sk-text">{lines(4)}</div>
      <div className="ai-sk-text">{lines(3)}</div>
    </div>
  </div>
);
