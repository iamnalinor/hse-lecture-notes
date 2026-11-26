import { useEffect, useRef } from "react";

import { useKeyboardInset } from "./use-keyboard-inset.ts";

/** Also used by the shell (`shell/chat-shell.tsx`), so the page makes room for the panel before the chat code is there. */
export const useRootOpenClassSync = (isOpen: boolean): void => {
  const savedScrollYRef = useRef<null | { url: string; y: number }>(null);
  useKeyboardInset(isOpen);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) {
      root.classList.add("ai-open");
      if (
        globalThis.window.matchMedia("(max-width: 720px)").matches &&
        savedScrollYRef.current === null
      ) {
        savedScrollYRef.current = { url: globalThis.location.href, y: globalThis.scrollY };
      }
      return;
    }
    root.classList.remove("ai-open");
    if (savedScrollYRef.current === null) {
      return;
    }
    const saved = savedScrollYRef.current;
    savedScrollYRef.current = null;
    if (
      saved.url === globalThis.location.href &&
      globalThis.window.matchMedia("(max-width: 720px)").matches
    ) {
      globalThis.window.scrollTo(0, saved.y);
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove("ai-open");
    },
    [],
  );
};
