import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const state = { isOpen: false, openedAt: -Infinity };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setChatOpen = (isNextOpen: ((wasOpen: boolean) => boolean) | boolean): void => {
  const wasOpen = state.isOpen;
  state.isOpen = typeof isNextOpen === "function" ? isNextOpen(state.isOpen) : isNextOpen;
  if (!wasOpen && state.isOpen) {
    state.openedAt = performance.now();
  }
  for (const listener of listeners) {
    listener();
  }
};

export const useIsChatOpen = () =>
  useSyncExternalStore(
    subscribe,
    () => state.isOpen,
    () => false,
  );

/** The drawer's slide-in time (`chat-frame.css`: 260 ms on desktop, 240 ms on a phone). */
const ENTRANCE_MS = 260;

/**
A panel that mounts already open (the first opening, or the real panel replacing the shell mid-slide)
has no closed state to transition from, so it plays the shell's entrance keyframes instead, shifted by
the time already spent opening: the slide continues where it is rather than starting over or jumping.
*/
export const entranceStyle = (): null | { readonly animationDelay: string } => {
  const elapsed = performance.now() - state.openedAt;
  return state.isOpen && elapsed < ENTRANCE_MS
    ? { animationDelay: `-${String(Math.round(elapsed))}ms` }
    : null;
};
