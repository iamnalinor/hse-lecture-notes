import { useQuery } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { labelIndexQuery, searchIndexQuery } from "#web/api/queries.ts";
import { canAutoDownload, type ConnectionInfo } from "#web/domain/connection.ts";
import { hitPath, prepareIndex, search, type SearchHit } from "#web/domain/search.ts";
import { SearchIcon } from "#web/shared/ui/icons.tsx";

import { resultId, SearchResults } from "./search-results.tsx";

/** Hits drawn at once: each one may hold formulas, and KaTeX is the slow part of a keystroke. */
const FIRST_HITS = 12;

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

/** The index (a few megabytes) is fetched only once the field is touched. */
const useHits = (
  query: string,
  isWanted: boolean,
): { readonly hits: readonly SearchHit[]; readonly status: string } => {
  // A stable `select`: the index is prepared once, not on every render.
  const index = useQuery({ ...searchIndexQuery, enabled: isWanted, select: prepareIndex });
  const labels = useQuery({ ...labelIndexQuery, enabled: isWanted });
  if (index.isError || labels.isError) {
    return { hits: [], status: "Не удалось загрузить поиск. Проверьте подключение." };
  }
  if (index.data === undefined || labels.data === undefined) {
    return { hits: [], status: "Загружаем конспекты…" };
  }
  const hits = search(index.data, labels.data, query);
  return { hits, status: hits.length === 0 ? "Ничего не нашлось." : "" };
};

const step = (active: number, delta: number, count: number): number =>
  count === 0 ? 0 : (active + delta + count) % count;

/** ⌘K, Ctrl+K and «/» focus the field; a press outside folds the panel. */
const useGlobalKeys = (
  boxRef: React.RefObject<HTMLDivElement | null>,
  fieldRef: React.RefObject<HTMLInputElement | null>,
  onOutside: () => void,
): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isShortcut(event)) {
        return;
      }

      event.preventDefault();
      fieldRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && boxRef.current?.contains(event.target) !== true) {
        onOutside();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [boxRef, fieldRef, onOutside]);
};

/** Fetched quietly a few seconds after load on Wi-Fi, so the first query answers at once. */
const PREFETCH_DELAY_MS = 3000;

const usePrefetchWhenFree = (want: () => void): void => {
  useEffect(() => {
    const { connection } = navigator as Navigator & { readonly connection?: ConnectionInfo };
    if (!canAutoDownload(connection)) {
      return;
    }
    const timer = setTimeout(want, PREFETCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [want]);
};

type State = {
  readonly active: number;
  readonly isOpen: boolean;
  readonly isWanted: boolean;
  readonly limit: number;
  readonly query: string;
};

const FOLDED: State = { active: 0, isOpen: false, isWanted: false, limit: FIRST_HITS, query: "" };

type FieldProps = {
  readonly active: number;
  readonly fieldRef: React.RefObject<HTMLInputElement | null>;
  readonly hasPanel: boolean;
  readonly onClear: () => void;
  readonly onFocus: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent) => void;
  readonly onQuery: (query: string) => void;
  readonly query: string;
};

const SearchField = ({
  active,
  fieldRef,
  hasPanel,
  onClear,
  onFocus,
  onKeyDown,
  onQuery,
  query,
}: FieldProps) => (
  <label className="flex h-11 items-center gap-2 rounded-lg border border-rule bg-card px-3 text-faint focus-within:border-ink/40 focus-within:text-ink md:w-64 lg:h-10 lg:w-72 lg:focus-within:w-104">
    <SearchIcon size={16} />
    <input
      aria-activedescendant={hasPanel ? resultId(active) : undefined}
      aria-autocomplete="list"
      aria-controls={hasPanel ? "search-results" : undefined}
      aria-expanded={hasPanel}
      aria-label="Поиск по конспектам"
      className="size-full min-w-0 bg-transparent text-body text-ink outline-none placeholder:text-faint lg:text-subhead [&::-webkit-search-cancel-button]:hidden"
      enterKeyHint="search"
      onChange={(event) => {
        onQuery(event.target.value);
      }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerDown={onFocus}
      placeholder="Поиск: «4.3», «миноры»"
      ref={fieldRef}
      role="combobox"
      type="search"
      value={query}
    />
    {query === "" ? (
      <kbd className="hidden rounded-sm border border-rule px-1.5 py-px text-caption whitespace-nowrap lg:inline">
        {isMac() ? "⌘K" : "Ctrl K"}
      </kbd>
    ) : (
      <button
        aria-label="Очистить"
        className="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
        onClick={onClear}
        type="button"
      >
        ✕
      </button>
    )}
  </label>
);

type PanelProps = {
  readonly active: number;
  readonly hits: readonly SearchHit[];
  readonly limit: number;
  readonly onHover: (index: number) => void;
  readonly onMore: () => void;
  readonly onPick: () => void;
  readonly status: string;
};

/** Right under the bar: full width on a phone, a dropdown under the field on a wide screen. */
const SearchPanel = ({ active, hits, limit, onHover, onMore, onPick, status }: PanelProps) => (
  <div className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-rule bg-card shadow-[0_12px_24px_-16px_rgba(0,0,0,0.35)] lg:right-8 lg:left-auto lg:mt-1 lg:w-xl lg:rounded-xl lg:border">
    <p className="px-5 text-subhead text-muted not-empty:py-5" role="status">
      {status}
    </p>
    {hits.length > 0 && (
      <SearchResults
        active={active}
        hits={hits.slice(0, limit)}
        onHover={onHover}
        onPick={onPick}
      />
    )}
    {hits.length > limit && (
      <button
        className="mx-2 mb-2 block min-h-11 w-[calc(100%-1rem)] cursor-pointer rounded-lg text-subhead text-muted hover:bg-wash hover:text-ink"
        onClick={onMore}
        type="button"
      >
        Показать ещё {hits.length - limit}
      </button>
    )}
  </div>
);

type PhoneProps = {
  readonly children: React.ReactNode;
  readonly isOpen: boolean;
  readonly onCancel: () => void;
  readonly onOpen: () => void;
};

/**
On a phone the bar keeps one row: a magnifier button sits next to the courses, and a tap unfolds the
field over that row with «Отмена» to fold it back. Folded, the field is `sr-only`, not
`hidden`: the tap focuses it right away, so iOS raises the keyboard. From `md` up the field is always in the bar.
*/
const PhoneFold = ({ children, isOpen, onCancel, onOpen }: PhoneProps) => (
  <>
    <button
      aria-label="Поиск"
      className={`size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-ink md:hidden ${isOpen ? "hidden" : "flex"}`}
      onClick={onOpen}
      type="button"
    >
      <SearchIcon size={20} />
    </button>
    <div
      className={
        isOpen
          ? "max-md:absolute max-md:inset-0 max-md:z-50 max-md:flex max-md:items-center max-md:gap-1 max-md:bg-paper max-md:pr-2 max-md:pl-4"
          : "max-md:sr-only"
      }
    >
      {children}
      {isOpen && (
        <button
          className="h-11 shrink-0 cursor-pointer rounded-lg px-3 text-subhead text-muted hover:text-ink md:hidden"
          onClick={onCancel}
          type="button"
        >
          Отмена
        </button>
      )}
    </div>
  </>
);

/**
Search lives in the top bar itself: a field that widens on focus, results unfold right under the bar
(full width on a phone), no modal. Enter or a tap opens a hit and folds the panel; Esc folds it too.
*/
export const HeaderSearch = () => {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(FOLDED);
  const { hits, status } = useHits(useDeferredValue(state.query), state.isWanted);
  const shown = Math.min(hits.length, state.limit);
  const fold = useCallback((): void => {
    setState((old) => ({ ...FOLDED, isWanted: old.isWanted }));
    fieldRef.current?.blur();
  }, []);
  const close = useCallback((): void => {
    setState((old) => ({ ...old, isOpen: false }));
  }, []);
  useGlobalKeys(boxRef, fieldRef, close);
  const want = useCallback((): void => {
    setState((old) => (old.isWanted ? old : { ...old, isWanted: true }));
  }, []);
  usePrefetchWhenFree(want);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    const hit = hits[state.active];
    const isPick = hit !== undefined && event.key === "Enter";
    if (isPick || event.key === "Escape") {
      event.preventDefault();
      fold();
      if (isPick) {
        void navigate(hitPath(hit));
      }
    } else if (delta !== undefined) {
      event.preventDefault();
      const next = step(state.active, delta, shown);
      setState((old) => ({ ...old, active: next }));
      document.querySelector(`#${resultId(next)}`)?.scrollIntoView({ block: "nearest" });
    }
  };

  const hasPanel = state.isOpen && state.query.trim() !== "";
  return (
    <div className="md:min-w-0 md:flex-none" ref={boxRef}>
      <PhoneFold isOpen={state.isOpen} onCancel={fold} onOpen={() => fieldRef.current?.focus()}>
        <div className="min-w-0 flex-1">
          <SearchField
            active={state.active}
            fieldRef={fieldRef}
            hasPanel={hasPanel && shown > 0}
            onClear={() => {
              setState((old) => ({ ...old, active: 0, limit: FIRST_HITS, query: "" }));
              fieldRef.current?.focus();
            }}
            onFocus={() => {
              setState((old) => ({ ...old, isOpen: true, isWanted: true }));
            }}
            onKeyDown={onKeyDown}
            onQuery={(query) => {
              setState((old) => ({ ...old, active: 0, isOpen: true, limit: FIRST_HITS, query }));
            }}
            query={state.query}
          />
        </div>
        {hasPanel && (
          <SearchPanel
            active={state.active}
            hits={hits}
            limit={state.limit}
            onHover={(active) => {
              setState((old) => ({ ...old, active }));
            }}
            onMore={() => {
              setState((old) => ({ ...old, limit: hits.length }));
            }}
            onPick={fold}
            status={status}
          />
        )}
      </PhoneFold>
    </div>
  );
};
