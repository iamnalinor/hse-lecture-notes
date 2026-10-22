import { lazy, Suspense, useEffect, useState } from "react";

import { SearchIcon } from "#web/shared/ui/icons.tsx";

// The dialog code is its own chunk, and the index loads only when the dialog opens.
const loadDialog = async () => await import("./search-dialog.tsx");
const SearchDialog = lazy(async () => {
  const { SearchDialog: Dialog } = await loadDialog();
  return { default: Dialog };
});
// Fetched soon after the page settles, so the first ⌘K does not drop the keys typed after it.
const PRELOAD_DELAY_MS = 2000;

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

/** ⌘K / Ctrl+K anywhere, «/» outside of text fields. By key position: the Russian layout too. */
const isShortcut = (event: KeyboardEvent): boolean => {
  if (event.metaKey || event.ctrlKey) {
    return event.code === "KeyK";
  }
  const isSlash = event.key === "/" || (event.code === "Slash" && !event.shiftKey);
  return isSlash && !event.altKey && !isTyping(event.target);
};

const isMac = (): boolean => /Mac|iPhone|iPad/u.test(navigator.userAgent);

export const SearchButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDialog();
    }, PRELOAD_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isShortcut(event)) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <>
      <button
        aria-label="Поиск"
        className="flex size-10 cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-rule bg-card text-[13.5px] text-faint transition-colors hover:text-ink lg:w-auto lg:min-w-65 lg:justify-start lg:px-3"
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        <SearchIcon size={15} />
        <span className="hidden lg:inline">Поиск: «4.3», «миноры»…</span>
        <kbd className="ml-auto hidden rounded-sm border border-rule px-1.5 py-px text-[11px] lg:inline">
          {isMac() ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {isOpen && (
        <Suspense>
          <SearchDialog
            onClose={() => {
              setIsOpen(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
};
