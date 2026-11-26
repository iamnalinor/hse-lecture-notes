import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";

import type { ChatQuote } from "#web/domain/chat/model.ts";

import { useIsMatching } from "#web/shared/ui/use-is-matching.ts";

import { SendIcon, StopIcon } from "../icons.tsx";
import { ChatQuoteCard } from "../messages/quote-card.tsx";
import { useChat } from "../session/context.tsx";
import { BottomCaption, BottomPlate, resolveBottomMode } from "./composer-plates.tsx";
import { useComposerSuggestion } from "./use-suggestion.ts";

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
    return "Уточни или спроси еще";
  }
  return "Задай вопрос";
};

type TextareaState = {
  readonly draft: string;
  readonly placeholder: string;
  readonly isOpen: boolean;
  readonly quoteKey: string;
};
const useComposerTextarea = ({ draft, placeholder, isOpen, quoteKey }: TextareaState) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    };
    resize();
    let isStale = false;
    // The webfont changes line breaks without changing the width, so measure again once it is in.
    const { fonts } = globalThis.document as Partial<Document>;
    const remeasureAfterFonts = async (): Promise<void> => {
      await fonts?.ready;
      if (!isStale) {
        resize();
      }
    };
    void remeasureAfterFonts();
    let width = el.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) {
              return;
            }

            width = el.clientWidth;
            resize();
          });
    observer?.observe(el);
    globalThis.addEventListener("resize", resize);
    return () => {
      isStale = true;
      observer?.disconnect();
      globalThis.removeEventListener("resize", resize);
    };
  }, [draft, placeholder, isOpen]);

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

/**
A device whose main input is a finger. Its on-screen keyboard has no Shift+Enter, so Enter is the only way to
start a new line there, as in a messenger; the question goes with the send button.
*/
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

const useComposerKeyDown = (canSend: boolean, suggestion: null | string, consume: () => void) => {
  const { send, setDraft } = useChat();
  const isTouch = useIsMatching(TOUCH_QUERY);
  return (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestion !== null && isPlainTab(event)) {
      event.preventDefault();
      setDraft(suggestion);
      consume();
      return;
    }
    if (isTouch || event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      void send();
    }
  };
};

const SendButton = ({ canSend }: { readonly canSend: boolean }) => {
  const { canStop, send, stop } = useChat();
  return canStop ? (
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
  );
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
  const { clearQuote, draft, isOpen, maxQuestionChars, messages, quote, setDraft } = useChat();
  const length = draft.trim().length;
  const isNearingLimit = length >= maxQuestionChars * 0.9;
  const isOverLimit = length > maxQuestionChars;
  const placeholder = suggestion ?? resolvePlaceholder(quote !== null, messages.length > 0);
  const textareaRef = useComposerTextarea({
    draft,
    placeholder,
    isOpen,
    quoteKey: quote?.tex ?? "",
  });

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
          aria-describedby={isNearingLimit ? "ai-question-count" : undefined}
          aria-invalid={isOverLimit || undefined}
          id="ai-input"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={draft}
        />
        <SendButton canSend={canSend} />
      </div>
      {isNearingLimit && (
        <div
          className={isOverLimit ? "ai-question-count ai-question-count-over" : "ai-question-count"}
          id="ai-question-count"
        >
          {length} / {maxQuestionChars}
        </div>
      )}
    </div>
  );
};

/*
The browser check after a Telegram login runs quietly: a question sent meanwhile joins the same check and
shows «Проверяю браузер…» in its own status line, as every question does; a failed check is repeated on send.
*/
const VerificationStatus = () => {
  const { loginError, draftError } = useChat();
  return (
    <>
      {typeof draftError === "string" && (
        <p className="ai-caption" role="status">
          {draftError}
        </p>
      )}
      {loginError && (
        <p className="ai-caption" role="status">
          Не удалось войти через Telegram. Попробуй еще раз.
        </p>
      )}
    </>
  );
};

const hasSendableDraft = (draft: string, quote: ChatQuote | null, maxChars: number): boolean =>
  draft.trim().length <= maxChars && (draft.trim() !== "" || quote !== null);

/** Exact `.ai-bottom` (composer / limit plate / status caption) from prototype.html. */
export const ChatComposer = (): JSX.Element => {
  const {
    block,
    degraded,
    draft,
    isStreaming,
    isThreadFailed,
    isThreadLoading,
    maxQuestionChars,
    quote,
    rateLimitUntil,
  } = useChat();
  const { suggestion, consume } = useComposerSuggestion();
  const nowMs = useClockTicker(rateLimitUntil, degraded.active);
  const mode = resolveBottomMode(block);
  const isThreadUnready = isThreadLoading || isThreadFailed;
  const rateRemainSec =
    rateLimitUntil > nowMs ? Math.max(0, Math.ceil((rateLimitUntil - nowMs) / 1000)) : 0;
  const canSend =
    !isThreadUnready &&
    !isStreaming &&
    mode === "composer" &&
    rateRemainSec === 0 &&
    hasSendableDraft(draft, quote, maxQuestionChars);

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
        <VerificationStatus />
        <BottomCaption mode={mode} nowMs={nowMs} rateRemainSec={rateRemainSec} />
      </div>
    </div>
  );
};
