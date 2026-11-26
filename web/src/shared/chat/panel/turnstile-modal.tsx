import { type JSX, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "../icons.tsx";

export const TURNSTILE_HOST_ID = "hse-turnstile-host";

export const TurnstileModal = ({
  cancelTurnstile,
  turnstileOpen,
}: {
  readonly cancelTurnstile: () => void;
  readonly turnstileOpen: boolean;
}): JSX.Element => {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (turnstileOpen && dialog !== null && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open === true) {
        dialog.close();
      }
    };
  }, [turnstileOpen]);
  return createPortal(
    <dialog
      aria-hidden={!turnstileOpen}
      aria-labelledby="ai-ts-title"
      className={turnstileOpen ? "ai-modal is-on" : "ai-modal"}
      inert={!turnstileOpen}
      onCancel={(event) => {
        event.preventDefault();
        cancelTurnstile();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          cancelTurnstile();
        }
      }}
      onKeyDown={undefined}
      ref={ref}
    >
      <div className="ai-modal-card">
        <button
          aria-label="Закрыть"
          className="ai-icon-btn ai-modal-x"
          onClick={cancelTurnstile}
          type="button"
        >
          <CloseIcon />
        </button>
        <h2 id="ai-ts-title">Подтверди, что ты не бот</h2>
        <div id={TURNSTILE_HOST_ID} />
      </div>
    </dialog>,
    document.body,
  );
};
