import { useEffect } from "react";

export const focusHeaderChatButton = (): void => {
  document.querySelector<HTMLButtonElement>(".ai-head-btn")?.focus({ preventScroll: true });
};

export type FocusOrigin = () => HTMLElement | null;
const restoreMobileFocus = (target?: HTMLElement | null): void => {
  if (target?.isConnected !== true) {
    focusHeaderChatButton();
    return;
  }
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener(
      "blur",
      () => {
        target.removeAttribute("tabindex");
      },
      { once: true },
    );
  }
  target.focus({ preventScroll: true });
};

export const useMobileFocus = (
  isOpen: boolean,
  panelEl: HTMLElement | null,
  takeSelectionOrigin?: FocusOrigin,
): void => {
  useEffect(() => {
    if (panelEl === null || !isOpen) {
      return;
    }
    const media = globalThis.matchMedia("(max-width: 720px)");
    const root = document.querySelector<HTMLElement>("#root");
    const sync = () => {
      if (root !== null) {
        root.inert = media.matches;
      }
      if (media.matches && !panelEl.contains(document.activeElement)) {
        panelEl.focus();
      }
    };
    const cycle = (event: KeyboardEvent) => {
      if (!media.matches || event.key !== "Tab" || event.defaultPrevented) {
        return;
      }
      const controls = [
        ...panelEl.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea, input, [tabindex="0"]',
        ),
      ].filter((el) => el.checkVisibility({ visibilityProperty: true }));
      const first = controls.at(0);
      const last = controls.at(-1);
      const [edge, next] = event.shiftKey ? [first, last] : [last, first];
      if (edge?.matches(":focus") !== true) {
        return;
      }

      event.preventDefault();
      next?.focus();
    };
    sync();
    panelEl.addEventListener("keydown", cycle);
    media.addEventListener("change", sync);
    return () => {
      panelEl.removeEventListener("keydown", cycle);
      media.removeEventListener("change", sync);
      if (root !== null) {
        root.inert = false;
      }
      const origin = takeSelectionOrigin?.();
      if (media.matches) {
        restoreMobileFocus(origin);
      }
    };
  }, [isOpen, panelEl, takeSelectionOrigin]);
};
