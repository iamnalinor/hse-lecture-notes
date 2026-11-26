import { useEffect, useSyncExternalStore } from "react";

/** A request from outside the chat (the search): open a new thread with `text` as an unsent draft. */
export type ChatLaunch = { readonly id: number; readonly text: string };

const listeners = new Set<() => void>();
const state: { counter: number; pending: ChatLaunch | null } = { counter: 0, pending: null };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Leaves a request for the session; it may not be mounted yet (the chat code downloads on the call). */
export const postChatLaunch = (text: string): void => {
  state.counter += 1;
  state.pending = { id: state.counter, text };
  for (const listener of listeners) {
    listener();
  }
};

/** The session calls `apply` once for every request, however late it mounts. */
export const useChatLaunch = (apply: (request: ChatLaunch) => void): void => {
  const request = useSyncExternalStore(
    subscribe,
    () => state.pending,
    () => null,
  );
  useEffect(() => {
    if (request === null || state.pending?.id !== request.id) {
      return;
    }
    state.pending = null;
    apply(request);
  }, [apply, request]);
};
