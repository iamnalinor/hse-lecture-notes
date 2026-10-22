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

export const setTheme = (theme: Theme): void => {
  document.documentElement.dataset["theme"] = theme;
  // The `media` variants of index.html are only the no-JS fallback: the chosen theme wins.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute("media");
    // Same colors as the meta tags and the inline script in index.html (it runs before any bundle).
    meta.content = theme === "dark" ? "#1a1916" : "#fcfbf7";
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
