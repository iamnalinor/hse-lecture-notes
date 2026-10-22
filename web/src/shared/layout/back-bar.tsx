import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { BackStateSchema } from "#web/domain/navigation.ts";

/**
After a jump by a reference the reader sees where they came from: a bar at the bottom of the
screen takes them back to the exact place (the history entry keeps the scroll position). It goes
away with the return, with any other navigation (the new place has no jump state) or with ×.
*/
export const BackBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissedKey, setDismissedKey] = useState<string | undefined>(undefined);
  const state = BackStateSchema.safeParse(location.state);

  if (!state.success || dismissedKey === location.key) {
    return null;
  }

  return (
    <aside
      aria-label="Возврат"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:px-6 sm:pb-6"
      key={location.key}
    >
      <div className="pointer-events-auto flex max-w-full items-stretch overflow-hidden rounded-full bg-ink text-sm text-paper shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] motion-safe:animate-[back-bar-in_0.22s_ease-out]">
        <button
          className="flex min-w-0 cursor-pointer items-center gap-2 py-2.5 pr-2 pl-4"
          onClick={() => {
            void navigate(-1);
          }}
          type="button"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">
            Назад: <b className="font-semibold">{state.data.backLabel}</b>
          </span>
        </button>
        <button
          aria-label="Скрыть"
          className="flex w-10 shrink-0 cursor-pointer items-center justify-center border-l border-paper/20 text-base"
          onClick={() => {
            setDismissedKey(location.key);
          }}
          type="button"
        >
          ×
        </button>
      </div>
    </aside>
  );
};
