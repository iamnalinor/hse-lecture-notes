import { formatSize, plural } from "#web/domain/text.ts";
import { DownloadIcon } from "#web/shared/ui/icons.tsx";

import { type DownloadState, useOfflineStatus } from "./use-offline-status.ts";

/** Share of the files downloaded, rounded down: 100 % only when everything is in. */
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

/**
Footer line: how many lecture notes open without internet, and a button to save the rest (with
the traffic it costs). On
Wi-Fi the rest is saved in the background (the counter grows as files arrive); the button then
takes over and downloads faster.
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
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        Офлайн: {count.saved} из {count.total}{" "}
        {plural(count.total, ["конспекта", "конспектов", "конспектов"])}
      </span>
      {progress !== undefined && <span aria-live="polite">{progress}</span>}
      {!isEverything && download.kind !== "running" && canDownload && (
        <button
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-rule px-2 py-1 text-[13px] font-semibold text-ink hover:bg-wash"
          onClick={startDownload}
          type="button"
        >
          <DownloadIcon size={14} />
          Скачать все
          {count.missingBytes !== undefined && count.missingBytes > 0 && (
            <span className="font-normal text-muted">· {formatSize(count.missingBytes)}</span>
          )}
        </button>
      )}
    </span>
  );
};
