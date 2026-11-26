import { useSyncExternalStore } from "react";

import type { ChatRuntime } from "./runtime.tsx";
import type { ChatLoadFailure } from "./shell/load-failure.ts";

import { classifyLoadFailure } from "./shell/build-version.ts";

type RuntimeComponent = typeof ChatRuntime;

export type ChatRuntimeLoad =
  | { readonly status: "failed"; readonly failure: ChatLoadFailure }
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly Runtime: RuntimeComponent };

const listeners = new Set<() => void>();
const idle: ChatRuntimeLoad = { status: "idle" };
const store: {
  /** A rejected import is dropped: `React.lazy` would keep the rejection forever. */
  importing: Promise<{ ChatRuntime: RuntimeComponent }> | undefined;
  load: ChatRuntimeLoad;
} = { importing: undefined, load: idle };

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

const download = async (): Promise<void> => {
  setLoad({ status: "loading" });
  try {
    const { ChatRuntime: Runtime } = await importRuntime();
    setLoad({ Runtime, status: "ready" });
  } catch {
    setLoad({ failure: await classifyLoadFailure(), status: "failed" });
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
