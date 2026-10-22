import { useSyncExternalStore } from "react";

/** Whether the media query matches now and after every change (rotation, resize). */
export const useIsMatching = (query: string): boolean =>
  useSyncExternalStore(
    (listener) => {
      const list = matchMedia(query);
      list.addEventListener("change", listener);
      return () => {
        list.removeEventListener("change", listener);
      };
    },
    () => matchMedia(query).matches,
    () => false,
  );
