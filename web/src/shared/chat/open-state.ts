import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const state = { isOpen: false };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setChatOpen = (isNextOpen: ((wasOpen: boolean) => boolean) | boolean): void => {
  state.isOpen = typeof isNextOpen === "function" ? isNextOpen(state.isOpen) : isNextOpen;
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
