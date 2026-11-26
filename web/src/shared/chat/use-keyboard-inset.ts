import { useEffect } from "react";

const PHONE_QUERY = "(max-width: 720px)";
const TOP_VAR = "--ai-vv-top";
const HEIGHT_VAR = "--ai-vv-height";

/**
The on-screen keyboard shrinks only the visual viewport (Android Chrome and iOS Safari), so a panel
fixed to the layout viewport stays behind it. While the chat is open on a phone, the panel takes the
visible rectangle (`--ai-vv-top`, `--ai-vv-height`, used by `.ai-panel` in `chat-frame.css`), and the
composer at its bottom rises with the keyboard. The message list keeps its distance from the end,
so the latest message stays where it was.
*/
export const useKeyboardInset = (isOpen: boolean): void => {
  useEffect(() => {
    const viewport = globalThis.visualViewport;
    if (!isOpen || viewport === null || !globalThis.window.matchMedia(PHONE_QUERY).matches) {
      return;
    }
    const root = document.documentElement;
    const apply = (): void => {
      const scroller = document.querySelector<HTMLElement>(".ai-panel .ai-scroll");
      const distance =
        scroller === null ? 0 : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      root.style.setProperty(TOP_VAR, `${viewport.offsetTop}px`);
      root.style.setProperty(HEIGHT_VAR, `${viewport.height}px`);
      if (scroller !== null) {
        scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight - distance;
      }
    };
    apply();
    // eslint-disable-next-line unicorn/prefer-observer-apis -- the keyboard is reported only by these VisualViewport events; no observer sees it
    viewport.addEventListener("resize", apply);
    // eslint-disable-next-line unicorn/prefer-observer-apis -- same: iOS moves the visual viewport (offsetTop) by scrolling it
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty(TOP_VAR);
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [isOpen]);
};
