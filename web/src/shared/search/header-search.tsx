import { useQuery } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { labelIndexQuery, searchIndexQuery } from "#web/api/queries.ts";
import { canAutoDownload, type ConnectionInfo, isDesktopDevice } from "#web/domain/connection.ts";
import { hitPath, prepareIndex, search, type SearchHit } from "#web/domain/search.ts";
import { useIsMatching } from "#web/shared/ui/use-is-matching.ts";

import { PhoneFold, SearchField, SearchPanel } from "./search-parts.tsx";
import { resultId } from "./search-results.tsx";

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

/** Below `md` the field folds behind the magnifier (Tailwind's `md` is 48rem). */
const PHONE_QUERY = "(width < 48rem)";

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
    if (!canAutoDownload(connection, { isDesktop: isDesktopDevice() })) {
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

type Refs = {
  readonly field: React.RefObject<HTMLInputElement | null>;
  readonly magnifier: React.RefObject<HTMLButtonElement | null>;
};

/** Ways to fold the panel: after a pick (focus leaves), on Esc or «Отмена» (focus stays near). */
const useFolding = (
  setState: React.Dispatch<React.SetStateAction<State>>,
  fieldRef: Refs["field"],
  magnifierRef: Refs["magnifier"],
) => {
  const fold = useCallback((): void => {
    setState((old) => ({ ...FOLDED, isWanted: old.isWanted }));
    fieldRef.current?.blur();
  }, [fieldRef, setState]);
  /** Folds without dropping the focus on `<body>`. */
  const dismiss = useCallback(
    (isToMagnifier: boolean): void => {
      setState((old) => ({ ...FOLDED, isWanted: old.isWanted }));
      (isToMagnifier ? magnifierRef : fieldRef).current?.focus();
    },
    [fieldRef, magnifierRef, setState],
  );
  const close = useCallback((): void => {
    setState((old) => ({ ...old, isOpen: false }));
  }, [setState]);
  return { close, dismiss, fold };
};

/** Arrows walk the hits, Enter opens the active one. */
const useFieldKeys = (
  {
    active,
    hits,
    shown,
  }: { readonly active: number; readonly hits: readonly SearchHit[]; readonly shown: number },
  setState: React.Dispatch<React.SetStateAction<State>>,
  fold: () => void,
) => {
  const navigate = useNavigate();
  return (event: React.KeyboardEvent): void => {
    const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    const hit = hits[active];
    if (hit !== undefined && event.key === "Enter") {
      event.preventDefault();
      fold();
      void navigate(hitPath(hit));
    } else if (delta !== undefined) {
      event.preventDefault();
      const next = step(active, delta, shown);
      setState((old) => ({ ...old, active: next }));
      document.querySelector(`#${resultId(next)}`)?.scrollIntoView({ block: "nearest" });
    }
  };
};

/** Search parameter that keeps the query: a link to `/?q=лагранж` opens the search with it. */
const QUERY_PARAM = "q";

const initialState = (search: string): State => {
  const query = new URLSearchParams(search).get(QUERY_PARAM) ?? "";
  return query === "" ? FOLDED : { ...FOLDED, isOpen: true, isWanted: true, query };
};

/** State of the search, opened with the query from the address if it has one. */
const useSearchState = () => {
  const { search } = useLocation();
  return useState(() => initialState(search));
};

/** `search` with the query put in (or taken out, when it is empty). */
const withQuery = (search: string, query: string): string => {
  const params = new URLSearchParams(search);
  if (query.trim() === "") {
    params.delete(QUERY_PARAM);
  } else {
    params.set(QUERY_PARAM, query.trim());
  }
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
};

/**
While the panel is open its query follows into the address (replacing the entry, so Back is not
spammed). A folded panel leaves the address alone: a pick navigates away by itself, and pages opened
meanwhile do not get the query. Esc and «Отмена» take it out with the returned function.
*/
const useQueryInUrl = (query: null | string): (() => void) => {
  const location = useLocation();
  const navigate = useNavigate();
  const put = useCallback(
    (text: string): void => {
      const search = withQuery(location.search, text);
      if (search !== location.search) {
        void navigate({ hash: location.hash, search }, { preventScrollReset: true, replace: true });
      }
    },
    [location.hash, location.search, navigate],
  );
  useEffect(() => {
    if (query !== null) {
      put(query);
    }
  }, [put, query]);
  return useCallback(() => {
    put("");
  }, [put]);
};

/** Tab out of the search folds the panel; Esc from any of its controls dismisses it. */
const boxHandlers = (close: () => void, dismiss: () => void) => ({
  onBlur: (event: React.FocusEvent): void => {
    // a click on a plain spot of the panel has no target: that is not leaving the search
    const to = event.relatedTarget;
    if (to instanceof Node && !event.currentTarget.contains(to)) {
      close();
    }
  },
  onKeyDown: (event: React.KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    dismiss();
  },
});

/**
Search lives in the top bar itself: a field that widens on focus, results unfold right under the bar
(full width on a phone), no modal. Enter or a tap opens a hit and folds the panel. Esc (from the field
or any button of the panel) and «Отмена» fold it too and keep the focus: in the field on a wide screen,
on the magnifier on a phone. Tab out of the search folds the panel.
*/
export const HeaderSearch = () => {
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const magnifierRef = useRef<HTMLButtonElement>(null);
  const isPhone = useIsMatching(PHONE_QUERY);
  const [state, setState] = useSearchState();
  const { hits, status } = useHits(useDeferredValue(state.query), state.isWanted);
  const shown = Math.min(hits.length, state.limit);
  const { close, dismiss, fold } = useFolding(setState, fieldRef, magnifierRef);
  useGlobalKeys(boxRef, fieldRef, close);
  const want = useCallback((): void => {
    setState((old) => (old.isWanted ? old : { ...old, isWanted: true }));
  }, [setState]);
  usePrefetchWhenFree(want);

  const dropQuery = useQueryInUrl(state.isOpen ? state.query : null);
  const onKeyDown = useFieldKeys({ active: state.active, hits, shown }, setState, fold);

  const hasPanel = state.isOpen && state.query.trim() !== "";
  return (
    <div
      className="md:min-w-0 md:flex-none"
      {...boxHandlers(close, () => {
        dropQuery();
        dismiss(isPhone);
      })}
      ref={boxRef}
    >
      <PhoneFold
        isOpen={state.isOpen}
        magnifierRef={magnifierRef}
        onCancel={() => {
          dropQuery();
          dismiss(true);
        }}
        onOpen={() => fieldRef.current?.focus()}
      >
        <div className="min-w-0 flex-1">
          <SearchField
            active={state.active}
            fieldRef={fieldRef}
            hasPanel={hasPanel && shown > 0}
            isTabbable={!isPhone || state.isOpen}
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
