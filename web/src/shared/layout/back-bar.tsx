import { useState } from "react";
import { NavigationType, useLocation, useNavigate, useNavigationType } from "react-router";

import { BackStateSchema, documentBackLabel } from "#web/domain/navigation.ts";
import { isOtherPage } from "#web/domain/paths.ts";

/**
A plain link from one document to another (the next lecture, a lecture named in the theory) gets the
same way back as a reference jump: the label names the page left. Only on a push, so Back and a
reload show nothing; the label is kept per history entry, so returning to it later shows it again.
*/
const useDocumentBack = (): string | undefined => {
  const location = useLocation();
  const type = useNavigationType();
  const [track, setTrack] = useState(() => ({
    key: location.key,
    labels: new Map<string, string>(),
    pathname: location.pathname,
  }));
  if (track.key !== location.key) {
    const labels = new Map(track.labels);
    const label =
      type === NavigationType.Push && isOtherPage(track.pathname, location.pathname)
        ? documentBackLabel(track.pathname, location.pathname)
        : undefined;
    if (label !== undefined && !labels.has(location.key)) {
      labels.set(location.key, label);
    }
    // Adjusting state while rendering: React drops this render and starts over with the new track.
    setTrack({ key: location.key, labels, pathname: location.pathname });
  }
  return track.labels.get(location.key);
};

export const BackBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissedKey, setDismissedKey] = useState<string | undefined>(undefined);
  const state = BackStateSchema.safeParse(location.state);
  const documentLabel = useDocumentBack();
  const label = state.success ? state.data.backLabel : documentLabel;

  if (label === undefined || dismissedKey === location.key) {
    return null;
  }

  return (
    <aside
      aria-label="Возврат"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:px-6 sm:pb-6"
      key={location.key}
    >
      <div className="pointer-events-auto flex max-w-full items-stretch overflow-hidden rounded-full bg-ink text-footnote text-paper shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] motion-safe:animate-[back-bar-in_0.22s_ease-out]">
        <button
          className="flex min-w-0 cursor-pointer items-center gap-2 py-2.5 pr-2 pl-4"
          onClick={() => {
            void navigate(-1);
          }}
          type="button"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">
            Назад: <b className="font-semibold">{label}</b>
          </span>
        </button>
        <button
          aria-label="Скрыть"
          className="flex w-10 shrink-0 cursor-pointer items-center justify-center border-l border-paper/20 text-body"
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
