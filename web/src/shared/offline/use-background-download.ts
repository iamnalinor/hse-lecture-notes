import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { OfflineManifest } from "#web/domain/offline.ts";

import { downloadAll } from "#web/api/offline-cache.ts";

import {
  currentConnection,
  scheduleBackgroundDownload,
  waitTurn,
  whenPageSettled,
} from "./background-download.ts";

/** Manifest versions whose background download finished or failed in this tab: never again. */
const finishedVersions = new Set<string>();

type Options = {
  /** «Скачать все» runs (or ran): it takes over. */
  readonly isManual: boolean;
  /** `undefined` until known, or when the page has no controlling worker to store the files. */
  readonly manifest: OfflineManifest | undefined;
};

/** Saves every document in the background on Wi-Fi or Ethernet; `true` while it downloads. */
export const useIsSavingInBackground = ({ isManual, manifest }: Options): boolean => {
  const client = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  useEffect(() => {
    if (manifest === undefined || isManual || finishedVersions.has(manifest.version)) {
      return;
    }
    const stop = scheduleBackgroundDownload({
      connection: currentConnection(),
      onPhase: (phase) => {
        setIsRunning(phase === "running");
        if (phase === "done" || phase === "failed") {
          finishedVersions.add(manifest.version);
        }
      },
      run: async (signal) => {
        await downloadAll(manifest, () => undefined, {
          signal,
          waitTurn: async () => {
            await waitTurn(() => client.isFetching() > 0);
          },
        });
      },
      whenSettled: whenPageSettled,
    });
    return () => {
      stop();
      setIsRunning(false);
    };
  }, [client, isManual, manifest]);
  return isRunning;
};
