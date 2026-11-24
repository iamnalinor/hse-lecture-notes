import { type JSX, useEffect, useRef } from "react";

const root = (): HTMLElement => document.documentElement;
const storageKey = "hse_chat_width";
const applyWidth = (width: number): void => {
  const bounded = Math.round(Math.max(320, Math.min(720, window.innerWidth * 0.55, width)));
  root().style.setProperty("--chat-preferred-width", `${bounded}px`);
};

const saveWidth = (): void => {
  try {
    localStorage.setItem(storageKey, root().style.getPropertyValue("--chat-preferred-width"));
  } catch {
    // The current page still keeps the chosen width when storage is unavailable.
  }
};

export const ChatResizeHandle = (): JSX.Element => {
  const offsetRef = useRef(0);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null && /^\d{3}px$/.test(stored)) {
        root().style.setProperty("--chat-preferred-width", stored);
      }
    } catch {
      // Private browsing may block storage.
    }
    return () => {
      root().classList.remove("ai-resizing");
    };
  }, []);

  return (
    <button
      aria-label="Изменить ширину чата"
      className="ai-resize"
      onKeyDown={(event) => {
        if (!(event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          return;
        }

        event.preventDefault();
        const panel = event.currentTarget.parentElement;
        if (panel === null) {
          return;
        }
        const width = panel.getBoundingClientRect().width;
        applyWidth(width + (event.key === "ArrowLeft" ? 24 : -24));
        saveWidth();
      }}
      onLostPointerCapture={() => {
        root().classList.remove("ai-resizing");
        saveWidth();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) {
          return;
        }
        const left =
          event.currentTarget.parentElement?.getBoundingClientRect().left ?? event.clientX;
        offsetRef.current = event.clientX - left;
        event.currentTarget.setPointerCapture(event.pointerId);
        root().classList.add("ai-resizing");
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          applyWidth(root().clientWidth - event.clientX + offsetRef.current);
        }
      }}
      title="Потяни границу или используй стрелки ← →"
      type="button"
    />
  );
};
