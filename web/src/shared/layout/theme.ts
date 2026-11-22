import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.dataset["theme"] === "dark" ? "dark" : "light");

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The colours change at once everywhere: for one frame no element fades on its own (`app.css`). */
const withoutTransitions = (apply: () => void): void => {
  const root = document.documentElement;
  root.dataset["themeSwitching"] = "";
  apply();
  // read a style so the new colours are computed while transitions are off
  getComputedStyle(root).getPropertyValue("color");
  requestAnimationFrame(() => {
    delete root.dataset["themeSwitching"];
  });
};

export const setTheme = (theme: Theme): void => {
  withoutTransitions(() => {
    document.documentElement.dataset["theme"] = theme;
  });
  // The `media` variants of index.html are only the no-JS fallback: the chosen theme wins.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute("media");
    // Same colors as the meta tags and the inline script in index.html (it runs before any bundle).
    meta.content = theme === "dark" ? "#141415" : "#fafaf8";
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice just does not persist.
  }
  for (const listener of listeners) {
    listener();
  }
};

/** The initial value is set before first paint by the inline script in `index.html`. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, read);
