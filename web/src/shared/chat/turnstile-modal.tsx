import type { JSX } from "react";

import { createPortal } from "react-dom";

import { CloseIcon } from "./chat-icons.tsx";

export const TURNSTILE_HOST_ID = "hse-turnstile-host";

export const TurnstileModal = ({
  cancelTurnstile,
  turnstileOpen,
}: {
  readonly cancelTurnstile: () => void;
  readonly turnstileOpen: boolean;
}): JSX.Element => {
  return createPortal(
    <div
      aria-hidden={!turnstileOpen}
      className={turnstileOpen ? "ai-modal is-on" : "ai-modal"}
      inert={!turnstileOpen}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          cancelTurnstile();
        }
      }}
      onKeyDown={undefined}
      role="presentation"
    >
      <div aria-labelledby="ai-ts-title" aria-modal="true" className="ai-modal-card" role="dialog">
        <button
          aria-label="Закрыть"
          className="ai-icon-btn ai-modal-x"
          onClick={cancelTurnstile}
          type="button"
        >
          <CloseIcon />
        </button>
        <h2 id="ai-ts-title">Подтвердите, что вы не бот</h2>
        <div id={TURNSTILE_HOST_ID} />
      </div>
    </div>,
    document.body,
  );
};
