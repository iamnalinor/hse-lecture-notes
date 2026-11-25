import { formatSize, plural } from "#web/domain/text.ts";
import { DownloadIcon } from "#web/shared/ui/icons.tsx";

import { type DownloadState, useOfflineStatus } from "./use-offline-status.ts";

/** Share of the bytes downloaded, rounded down: 100 % only when everything is in. */
const percent = (done: number, total: number): number =>
  total === 0 ? 0 : Math.floor((done / total) * 100);

const progressText = (download: DownloadState): string | undefined => {
  switch (download.kind) {
    case "running": {
      return `Скачиваем… ${String(percent(download.done, download.total))}%`;
    }
    case "background": {
      return "Сохраняем остальные в фоне…";
    }
    case "failed": {
      return download.message;
    }
    case "idle": {
      return undefined;
    }
  }
};

type DownloadButtonProps = {
  readonly missingBytes: number | undefined;
  readonly onClick: () => void;
};

const DownloadButton = ({ missingBytes, onClick }: DownloadButtonProps) => (
  <button
    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-subhead font-semibold text-ink hover:bg-wash"
    onClick={onClick}
    type="button"
  >
    <DownloadIcon size={14} />
    Скачать все
    {missingBytes !== undefined && missingBytes > 0 && (
      <span className="font-normal text-muted">· {formatSize(missingBytes)}</span>
    )}
  </button>
);

/**
Footer line: how many lecture notes open without internet, and a button to save the rest (with
the traffic it costs). On
Wi-Fi the rest is saved in the background (the counter grows as files arrive). While anything is
being saved, its progress stands in the button's place: the footer does not reflow.
*/
export const OfflineStatus = () => {
  const { canDownload, count, download, startDownload } = useOfflineStatus();
  if (count === undefined) {
    return null;
  }
  const isEverything = count.saved === count.total;
  // With every note saved, the background run only tops up theory and glossaries: no need to say.
  const progress =
    isEverything && download.kind === "background" ? undefined : progressText(download);
  // While saving, the progress takes the button's place; after a failure, both: the reason and a retry.
  const canRetry =
    canDownload && !isEverything && (progress === undefined || download.kind === "failed");
  return (
    <span className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:inline-flex sm:w-auto sm:justify-start">
      <span>
        Офлайн: {count.saved} из {count.total}{" "}
        {plural(count.total, ["конспекта", "конспектов", "конспектов"])}
      </span>
      {progress !== undefined && (
        // In the button's place while saving, so the footer keeps its lines.
        <span aria-live="polite" className="py-1 whitespace-nowrap tabular-nums">
          {progress}
        </span>
      )}
      {canRetry && <DownloadButton missingBytes={count.missingBytes} onClick={startDownload} />}
    </span>
  );
};
