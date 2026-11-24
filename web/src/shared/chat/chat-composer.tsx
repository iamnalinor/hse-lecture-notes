import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { BottomCaption, BottomPlate, resolveBottomMode } from "./chat-composer-plates.tsx";
import { useChat } from "./chat-context.tsx";
import { SendIcon, StopIcon } from "./chat-icons.tsx";
import { ChatQuoteCard } from "./chat-quote-card.tsx";
import { useComposerSuggestion } from "./use-composer-suggestion.ts";

const useClockTicker = (rateLimitUntil: number, isDegraded: boolean): number => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isFast = rateLimitUntil > nowMs;

  useEffect(() => {
    if (!isFast && !isDegraded) {
      return;
    }
    const id = globalThis.setInterval(
      () => {
        setNowMs(Date.now());
      },
      isFast ? 250 : 30_000,
    );
    return () => {
      globalThis.clearInterval(id);
    };
  }, [isDegraded, isFast]);

  return nowMs;
};

const resolvePlaceholder = (hasQuote: boolean, hasMessages: boolean): string => {
  if (hasQuote) {
    return "Что непонятно в этом фрагменте?";
  }
  if (hasMessages) {
    return "Уточните или спросите ещё";
  }
  return "Задайте вопрос";
};

const useComposerTextarea = (draft: string, isOpen: boolean, quoteKey: string) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = globalThis.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
    return () => {
      globalThis.cancelAnimationFrame(frame);
    };
  }, [isOpen, quoteKey]);

  return textareaRef;
};

const isPlainTab = (event: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  event.key === "Tab" &&
  !event.nativeEvent.isComposing &&
  ![event.shiftKey, event.altKey, event.ctrlKey, event.metaKey].some(Boolean);

const useComposerKeyDown = (canSend: boolean, suggestion: null | string, consume: () => void) => {
  const { send, setDraft } = useChat();
  return (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestion !== null && isPlainTab(event)) {
      event.preventDefault();
      setDraft(suggestion);
      consume();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      void send();
    }
  };
};

const ComposerBox = ({
  canSend,
  suggestion,
  consume,
}: {
  readonly canSend: boolean;
  readonly suggestion: null | string;
  readonly consume: () => void;
}): JSX.Element => {
  const { canStop, clearQuote, draft, isOpen, messages, quote, send, setDraft, stop } = useChat();
  const textareaRef = useComposerTextarea(draft, isOpen, quote?.tex ?? "");

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
  };

  const handleKeyDown = useComposerKeyDown(canSend, suggestion, consume);

  return (
    <div className="ai-composer">
      {quote !== null && (
        <div className="ai-draft-quote ai-fade">
          <ChatQuoteCard onRemove={clearQuote} quote={quote} />
        </div>
      )}
      <div className="ai-row">
        <label className="ai-sr" htmlFor="ai-input">
          Сообщение в чат
        </label>
        <textarea
          id="ai-input"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={suggestion ?? resolvePlaceholder(quote !== null, messages.length > 0)}
          ref={textareaRef}
          rows={1}
          value={draft}
        />
        {canStop ? (
          <button
            aria-label="Остановить ответ"
            className="ai-send is-stop"
            onClick={stop}
            title="Остановить"
            type="button"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            aria-label="Отправить"
            className="ai-send"
            disabled={!canSend}
            onClick={() => {
              void send();
            }}
            title="Отправить (Enter)"
            type="button"
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
};

/** Exact `.ai-bottom` (composer / limit plate / status caption) from prototype.html. */
export const ChatComposer = (): JSX.Element => {
  const { block, degraded, draft, isStreaming, isThreadLoading, quote, rateLimitUntil } = useChat();
  const { suggestion, consume } = useComposerSuggestion();
  const nowMs = useClockTicker(rateLimitUntil, degraded.active);
  const mode = resolveBottomMode(block);
  const rateRemainSec =
    rateLimitUntil > nowMs ? Math.max(0, Math.ceil((rateLimitUntil - nowMs) / 1000)) : 0;
  const canSend =
    !isThreadLoading &&
    !isStreaming &&
    mode === "composer" &&
    rateRemainSec === 0 &&
    (draft.trim() !== "" || quote !== null);

  return (
    <div className="ai-bottom">
      <div className="ai-mode ai-flow">
        {mode === "composer" ? (
          <ComposerBox canSend={canSend} consume={consume} suggestion={suggestion} />
        ) : (
          <BottomPlate mode={mode} />
        )}
      </div>
      <div className="ai-caption-slot ai-flow">
        <BottomCaption mode={mode} nowMs={nowMs} rateRemainSec={rateRemainSec} />
      </div>
    </div>
  );
};
