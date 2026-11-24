import type { JSX } from "react";

import { type ChatBlock, formatDegradedCaption } from "#web/domain/chat.ts";

import { useChat } from "./chat-context.tsx";
import { AlertIcon, InfoIcon, TelegramIcon } from "./chat-icons.tsx";
import { ChatQuoteCard } from "./chat-quote-card.tsx";

export type BottomMode = "composer" | "down" | "limit" | "login";

export const resolveBottomMode = (block: ChatBlock | null): BottomMode => {
  if (block === null) {
    return "composer";
  }
  if (
    block.code === "service_unavailable" ||
    block.code === "oauth_unavailable" ||
    block.code === "global_budget_exceeded"
  ) {
    return "down";
  }
  if (block.code === "auth_required" || block.code === "guest_budget_exceeded") {
    return "login";
  }
  if (block.code === "tier_quota_exceeded") {
    return "limit";
  }
  return "composer";
};

const formatClockTime = (timestampMs: null | number | undefined): null | string => {
  if (timestampMs === undefined || timestampMs === null) {
    return null;
  }
  const date = new Date(timestampMs);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const RetryButton = (): JSX.Element => {
  const { clearBlock } = useChat();
  return (
    <button className="ai-btn ai-btn-2" onClick={clearBlock} type="button">
      Попробовать снова
    </button>
  );
};

export const BottomPlate = ({
  mode,
}: {
  readonly mode: Exclude<BottomMode, "composer">;
}): JSX.Element => {
  const { block, clearQuote, draft, isLoginBusy, login, quote } = useChat();
  const hasDraft = draft.trim() !== "" || quote !== null;
  const keepNote = hasDraft ? " Черновик сохранится." : "";
  const plateQuote =
    quote === null ? null : (
      <div className="ai-plate-quote">
        <ChatQuoteCard onRemove={clearQuote} quote={quote} />
      </div>
    );

  if (mode === "down") {
    return (
      <div className="ai-plate ai-fade" role="status">
        {plateQuote}
        <div className="ai-plate-row">
          <AlertIcon />
          <div>
            <b>ИИ временно не отвечает</b>
            <p>{`Слишком большая нагрузка, попробуйте позже.${keepNote}`}</p>
          </div>
        </div>
        <RetryButton />
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="ai-plate ai-fade" role="status">
        {plateQuote}
        <b>Гостевые ответы закончились</b>
        <p>Войди через Telegram, чтобы продолжить.</p>
        <div className="ai-plate-actions">
          <button
            className="ai-btn"
            disabled={isLoginBusy}
            onClick={() => {
              void login();
            }}
            type="button"
          >
            {isLoginBusy ? (
              <>
                <span className="ai-spin" />
                Ждём Telegram…
              </>
            ) : (
              <>
                <TelegramIcon />
                Войти через Telegram
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const nextTime = formatClockTime(block?.nextAvailableAt);
  return (
    <div className="ai-plate ai-fade" role="status">
      {plateQuote}
      <b>Лимит ответов исчерпан</b>
      <p>
        {nextTime === null ? (
          `Попробуйте снова позже.${keepNote}`
        ) : (
          <>
            Следующий ответ будет доступен в <time>{nextTime}</time>.{keepNote}
          </>
        )}
      </p>
    </div>
  );
};

type CaptionProps = {
  readonly mode: BottomMode;
  readonly nowMs: number;
  readonly rateRemainSec: number;
};

const AccountCaption = ({ compact }: { readonly compact: boolean }): JSX.Element | null => {
  const { isLoginBusy, isStreaming, switchAccount, tier, user } = useChat();
  if (tier !== "default" || user === null) {
    return null;
  }
  return (
    <p className="ai-caption ai-fade">
      {!compact && <InfoIcon />}
      <span>
        {!compact && (
          <>
            У студентов 1 курса ПИ лимиты выше. Если вы среди них, войдите с аккаунта, который есть
            в чате потока.
            <br />
          </>
        )}
        {`Вы вошли как ${user.name}. `}
        <button
          disabled={isLoginBusy || isStreaming}
          onClick={() => {
            void switchAccount();
          }}
          type="button"
        >
          Сменить аккаунт
        </button>
      </span>
    </p>
  );
};

export const BottomCaption = ({ mode, nowMs, rateRemainSec }: CaptionProps): JSX.Element | null => {
  const { contextLimited, degraded } = useChat();
  let primary: JSX.Element | null = null;
  if (mode === "composer") {
    const copy =
      contextLimited === true
        ? "Чат слишком длинный, качество снижено. Рекомендуем создать новый чат"
        : formatDegradedCaption(degraded, nowMs);
    if (rateRemainSec > 0) {
      primary = (
        <p className="ai-caption ai-fade" role="status">
          <InfoIcon />
          <span>
            Слишком много вопросов подряд. Отправить можно через{" "}
            <time>{`0:${String(rateRemainSec).padStart(2, "0")}`}</time>
          </span>
        </p>
      );
    } else if (copy !== null) {
      primary = (
        <p className="ai-caption ai-fade" role="status">
          <InfoIcon />
          <span>{copy}</span>
        </p>
      );
    }
  }
  return (
    <>
      {primary}
      <AccountCaption compact={mode !== "composer" || primary !== null} />
    </>
  );
};
