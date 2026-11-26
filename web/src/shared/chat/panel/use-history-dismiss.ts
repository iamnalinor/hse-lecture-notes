import { useEffect, useRef } from "react";

export const useHistoryDismiss = (isOpen: boolean, onClose: () => void) => {
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const isInside = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      headerRef.current?.contains(target) === true &&
      target.closest(".ai-hist-menu, [data-history-trigger]") !== null;
    const onPointerDown = (event: PointerEvent): void => {
      if (!isInside(event.target)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
      headerRef.current?.querySelector<HTMLButtonElement>("[data-history-trigger]")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, onClose]);
  return headerRef;
};
