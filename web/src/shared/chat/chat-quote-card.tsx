import type { JSX } from "react";

import type { ChatQuote } from "#web/domain/chat.ts";

import { CloseIcon, QuoteIcon } from "./chat-icons.tsx";
import { InlineTeX } from "./chat-markdown.tsx";

type Props = {
  readonly onClick?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly quote: ChatQuote;
};

/** Exact `.ai-quote` card from prototype.html (used in user messages, composer, and limit plates). */
export const ChatQuoteCard = ({ onClick, onRemove, quote }: Props): JSX.Element => {
  const inner = (
    <>
      <span className="ai-quote-src">
        <QuoteIcon />
        <b>{quote.label}</b>
      </span>
      <span className="ai-quote-txt">
        <InlineTeX text={quote.tex} />
      </span>
      {onRemove !== undefined && (
        <button
          aria-label="Убрать цитату"
          className="ai-icon-btn ai-x"
          onClick={onRemove}
          type="button"
        >
          <CloseIcon />
        </button>
      )}
    </>
  );

  if (onClick !== undefined) {
    return (
      <button className="ai-quote" onClick={onClick} title="Показать в конспекте" type="button">
        {inner}
      </button>
    );
  }

  return <div className="ai-quote">{inner}</div>;
};
