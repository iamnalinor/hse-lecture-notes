import { useSyncExternalStore } from "react";

import type { ChatRuntime } from "./runtime.tsx";
import type { ChatLoadFailure } from "./shell/load-failure.ts";

type RuntimeComponent = typeof ChatRuntime;

export type ChatRuntimeLoad =
  | { readonly status: "failed"; readonly failure: ChatLoadFailure }
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly Runtime: RuntimeComponent };

const PROBE_TIMEOUT_MS = 4000;
const listeners = new Set<() => void>();
const idle: ChatRuntimeLoad = { status: "idle" };
const store: {
  failedLoads: number;
  /** A rejected import is dropped: `React.lazy` would keep the rejection forever. */
  importing: Promise<{ ChatRuntime: RuntimeComponent }> | undefined;
  load: ChatRuntimeLoad;
} = { failedLoads: 0, importing: undefined, load: idle };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setLoad = (next: ChatRuntimeLoad): void => {
  store.load = next;
  for (const listener of listeners) {
    listener();
  }
};

const importRuntime = async () => {
  store.importing ??= import("./runtime.tsx");
  try {
    return await store.importing;
  } catch (error) {
    store.importing = undefined;
    throw error;
  }
};

/** Starts the download on intent (hover, focus, touch) so the click often finds it done. */
export const prefetchChatRuntime = async (): Promise<void> => {
  try {
    await importRuntime();
  } catch {
    // A click retries and shows the failure.
  }
};

/** `sw.js` is never precached by the worker, so an answer, even a 404, proves the site is reachable. */
const isSiteReachable = async (): Promise<boolean> => {
  try {
    await fetch(`${import.meta.env.BASE_URL}sw.js`, {
      cache: "no-store",
      method: "HEAD",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
};

/**
The first failure is shown as a network one, so «Повторить» is offered; a retry that fails while
the site answers means the file itself is gone, and only a reload gets the new one.
*/
const classifyFailure = async (): Promise<ChatLoadFailure> => {
  if (!navigator.onLine) {
    return "offline";
  }
  return store.failedLoads > 1 && (await isSiteReachable()) ? "stale" : "network";
};

const download = async (): Promise<void> => {
  setLoad({ status: "loading" });
  try {
    const { ChatRuntime: Runtime } = await importRuntime();
    store.failedLoads = 0;
    setLoad({ Runtime, status: "ready" });
  } catch {
    store.failedLoads += 1;
    setLoad({ failure: await classifyFailure(), status: "failed" });
  }
};

/** Downloads the chat unless that is under way or done; after a failure it is the retry. */
export const loadChatRuntime = (): void => {
  if (store.load.status !== "loading" && store.load.status !== "ready") {
    void download();
  }
};

export const useChatRuntimeLoad = (): ChatRuntimeLoad =>
  useSyncExternalStore(
    subscribe,
    () => store.load,
    () => idle,
  );
