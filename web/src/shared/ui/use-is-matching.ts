import { useSyncExternalStore } from "react";

/** Whether the media query matches now and after every change (rotation, resize). */
export const useIsMatching = (query: string): boolean =>
  useSyncExternalStore(
    (listener) => {
      if (typeof globalThis.matchMedia !== "function") {
        return () => {
          // nothing to unsubscribe
        };
      }
      const list = matchMedia(query);
      list.addEventListener("change", listener);
      return () => {
        list.removeEventListener("change", listener);
      };
    },
    // jsdom (tests) has no matchMedia: there nothing matches
    () => typeof globalThis.matchMedia === "function" && matchMedia(query).matches,
    () => false,
  );
