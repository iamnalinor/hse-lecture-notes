import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  downloadAll,
  fetchOfflineManifest,
  isOfflineSupported,
  readCachedHashes,
} from "#web/api/offline-cache.ts";
import { countSavedNotes, type OfflineCount } from "#web/domain/offline.ts";

import { useIsSavingInBackground } from "./use-background-download.ts";

const COUNT_KEY = ["offline-count"] as const;
const RECOUNT_DELAY_MS = 400;

export type DownloadState =
  /** On Wi-Fi the site saves everything by itself (`use-background-download.ts`). */
  | { readonly done: number; readonly kind: "running"; readonly total: number }
  | { readonly kind: "background" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "idle" };

export type OfflineStatus = {
  /** Saving needs a worker that controls the page (not yet on the very first visit). */
  readonly canDownload: boolean;
  /** `undefined` while unknown or when the site runs without a service worker. */
  readonly count: OfflineCount | undefined;
  readonly download: DownloadState;
  readonly startDownload: () => void;
};

const subscribeController = (onChange: () => void): (() => void) => {
  if (!isOfflineSupported()) {
    return () => undefined;
  }
  navigator.serviceWorker.addEventListener("controllerchange", onChange);
  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  };
};

const useIsControlled = (): boolean =>
  useSyncExternalStore(
    subscribeController,
    () => isOfflineSupported() && navigator.serviceWorker.controller !== null,
    () => false,
  );

/**
The worker announces every document file it stores; recount when it does, at most once per
`RECOUNT_DELAY_MS` (throttled, not debounced: during a download files arrive faster than that,
and the counter must still grow as they do).
*/
const useRecountOnCache = (): void => {
  const client = useQueryClient();
  useEffect(() => {
    if (!isOfflineSupported()) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recount = (): void => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ queryKey: COUNT_KEY });
      }, RECOUNT_DELAY_MS);
    };
    navigator.serviceWorker.addEventListener("message", recount);
    navigator.serviceWorker.addEventListener("controllerchange", recount);
    // Messages of the worker are queued until this (assigning `onmessage` would do it implicitly).
    navigator.serviceWorker.startMessages();
    return () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", recount);
      navigator.serviceWorker.removeEventListener("controllerchange", recount);
    };
  }, [client]);
};

const downloadState = (
  mutation: { readonly error: unknown; readonly status: string },
  progress: { readonly done: number; readonly total: number },
  isBackground: boolean,
): DownloadState => {
  if (mutation.status === "pending") {
    return { ...progress, kind: "running" };
  }
  if (mutation.status === "error") {
    const message = mutation.error instanceof Error ? mutation.error.message : "";
    return { kind: "failed", message: message === "" ? "Не получилось скачать" : message };
  }
  return { kind: isBackground ? "background" : "idle" };
};

/** Saved lecture notes (only up-to-date copies count) and the «download everything» action. */
export const useOfflineStatus = (): OfflineStatus => {
  const client = useQueryClient();
  const isControlled = useIsControlled();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useRecountOnCache();

  const manifest = useQuery({
    enabled: isOfflineSupported(),
    gcTime: Infinity,
    queryFn: fetchOfflineManifest,
    queryKey: ["offline-manifest"],
    staleTime: Infinity,
    throwOnError: false,
  }).data;

  const count = useQuery({
    enabled: manifest !== undefined,
    queryFn: async () =>
      manifest === undefined
        ? undefined
        : countSavedNotes(manifest, await readCachedHashes(manifest)),
    queryKey: [...COUNT_KEY, manifest?.version],
    throwOnError: false,
  }).data;

  const download = useMutation({
    mutationFn: async () => {
      if (manifest !== undefined) {
        await downloadAll(manifest, (done, total) => {
          setProgress({ done, total });
        });
      }
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: COUNT_KEY });
    },
    throwOnError: false,
  });

  const isBackground = useIsSavingInBackground({
    // «idle»: «Скачать все» was never pressed in this tab; once it was, it is in charge.
    isManual: download.status !== "idle",
    manifest: isControlled ? manifest : undefined,
  });

  return {
    canDownload: isControlled && manifest !== undefined,
    count,
    download: downloadState(download, progress, isBackground),
    startDownload: () => {
      download.mutate();
    },
  };
};
