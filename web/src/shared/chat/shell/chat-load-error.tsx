import type { JSX } from "react";

import type { ChatLoadFailure } from "./load-failure.ts";

import { TriangleExclamationPointIcon } from "../icons.tsx";

const HINTS = {
  network: "Проверь подключение и попробуй еще раз",
  offline: "Нет сети. Чат откроется, когда связь вернется",
  stale: "Похоже, вышла новая версия сайта",
} as const satisfies Record<ChatLoadFailure, string>;

type Props = {
  readonly failure: ChatLoadFailure;
  readonly onRetry: () => void;
};

/**
The one «could not load» message of the chat: shown in the shell when the chat code did not
arrive and in the log when a thread did not. It sits in the middle of the area it stands for.
*/
export const ChatLoadError = ({ failure, onRetry }: Props): JSX.Element => (
  <div className="ai-load-error ai-fade" role="alert">
    <span aria-hidden="true" className="ai-load-error-icon">
      <TriangleExclamationPointIcon />
    </span>
    <b>Не удалось загрузить чат</b>
    <p>{HINTS[failure]}</p>
    <button
      className="ai-btn ai-btn-2"
      onClick={
        failure === "stale"
          ? () => {
              location.reload();
            }
          : onRetry
      }
      type="button"
    >
      {failure === "stale" ? "Обновить страницу" : "Повторить"}
    </button>
  </div>
);

/** A thread that does not load is the network's fault or the lack of it; a new site version only breaks the chat code. */
export const threadLoadFailure = (): ChatLoadFailure => (navigator.onLine ? "network" : "offline");
