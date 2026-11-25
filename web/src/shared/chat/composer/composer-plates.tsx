import type { JSX } from "react";

import {
  blockPlateCopy,
  type ChatBlock,
  type ChatPlateCopy,
  type ChatTier,
  formatDegradedCaption,
} from "#web/domain/chat/model.ts";

import { AlertIcon, InfoIcon, TelegramIcon } from "../icons.tsx";
import { ChatQuoteCard } from "../messages/quote-card.tsx";
import { useChat } from "../session/context.tsx";

export type BottomMode = "composer" | "down" | "limit" | "login";

export const resolveBottomMode = (block: ChatBlock | null): BottomMode => {
  if (block === null) {
    return "composer";
  }
  if (
    block.code === "service_unavailable" ||
    block.code === "oauth_unavailable" ||
    block.code === "global_budget_exceeded" ||
    block.code === "concurrent_run"
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

const guestLimitTitle = (block: ChatBlock | null): string => {
  if (block?.code === "guest_budget_exceeded") {
    return "Общий бюджет гостевых ответов исчерпан";
  }
  return typeof block?.nextAvailableAt === "number"
    ? "Лимит гостевых ответов исчерпан"
    : "Для отправки вопроса нужен вход";
};

const OVERLOAD_COPY = {
  title: "ИИ временно не отвечает",
  body: "Слишком большая нагрузка, попробуй позже.",
};

/** Budget and concurrent-run blocks are not overload: their copy does not depend on the clock. */
const downCopy = (
  block: ChatBlock | null,
  tier: ChatTier,
): Pick<ChatPlateCopy, "body" | "title"> =>
  block?.code === "global_budget_exceeded" || block?.code === "concurrent_run"
    ? blockPlateCopy(block, tier, 0)
    : OVERLOAD_COPY;

const GuestLimit = ({ block }: { readonly block: ChatBlock | null }) => (
  <>
    <b>{guestLimitTitle(block)}</b>
    <p>
      {typeof block?.nextAvailableAt === "number" && (
        <>
          Следующий ответ будет доступен в{" "}
          <time dateTime={new Date(block.nextAvailableAt).toISOString()}>
            {formatClockTime(block.nextAvailableAt)}
          </time>
          .{" "}
        </>
      )}
      Войди через Telegram, чтобы продолжить
    </p>
  </>
);

export const BottomPlate = ({
  mode,
}: {
  readonly mode: Exclude<BottomMode, "composer">;
}): JSX.Element => {
  const { block, clearQuote, draft, isLoginBusy, telegramLoadFailed, login, quote, tier } =
    useChat();
  const hasDraft = draft.trim() !== "" || quote !== null;
  const keepNote = hasDraft ? " Черновик сохранится." : "";
  const plateQuote =
    quote === null ? null : (
      <div className="ai-plate-quote">
        <ChatQuoteCard onRemove={clearQuote} quote={quote} />
      </div>
    );

  if (mode === "down") {
    const copy = downCopy(block, tier);
    return (
      <div className="ai-plate ai-fade" role="status">
        {plateQuote}
        <div className="ai-plate-row">
          <AlertIcon />
          <div>
            <b>{copy.title}</b>
            <p>{`${copy.body}${keepNote}`}</p>
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
        <GuestLimit block={block} />
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
                Ждем Telegram…
              </>
            ) : (
              <>
                <TelegramIcon />
                {telegramLoadFailed ? "Повторить загрузку Telegram" : "Войти через Telegram"}
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
          `Попробуй снова позже.${keepNote}`
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
  const { isLoginBusy, isStreaming, switchAccount, telegramLoadFailed, tier, user } = useChat();
  if (tier !== "default" || user === null) {
    return null;
  }
  return (
    <p className="ai-caption ai-fade">
      {!compact && <InfoIcon />}
      <span>
        {!compact && (
          <>
            У студентов 1 курса ПИ лимиты выше. Если ты среди них, войди с аккаунта, который есть в
            чате потока.
            <br />
          </>
        )}
        {`Твой аккаунт — ${user.name}. `}
        <button
          disabled={isLoginBusy || isStreaming}
          onClick={() => {
            void switchAccount();
          }}
          type="button"
        >
          {telegramLoadFailed ? "Повторить загрузку Telegram" : "Сменить аккаунт"}
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
