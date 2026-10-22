import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { labelIndexQuery, searchIndexQuery } from "#web/api/queries.ts";
import { hitPath, prepareIndex, search, type SearchHit } from "#web/domain/search.ts";
import { SearchIcon } from "#web/shared/ui/icons.tsx";

import { resultId, SearchResults } from "./search-results.tsx";

type Props = { readonly onClose: () => void };

const useHits = (query: string): { hits: readonly SearchHit[]; status: string } => {
  // A stable `select`: the index is prepared once, not on every render.
  const index = useQuery({ ...searchIndexQuery, select: prepareIndex });
  const labels = useQuery(labelIndexQuery);
  const hits = useMemo(
    () =>
      index.data === undefined || labels.data === undefined
        ? []
        : search(index.data, labels.data, query),
    [index.data, labels.data, query],
  );
  if (index.isError || labels.isError) {
    return { hits, status: "Не удалось загрузить поиск. Проверьте подключение." };
  }
  if (query.trim() === "") {
    return { hits, status: "Номер блока («4.3») или слова из текста конспектов" };
  }
  if (index.data === undefined || labels.data === undefined) {
    return { hits, status: "Загружаем конспекты…" };
  }
  return { hits, status: hits.length === 0 ? "Ничего не нашлось." : "" };
};

const step = (active: number, delta: number, count: number): number =>
  count === 0 ? 0 : (active + delta + count) % count;

/** The search panel inside the modal: input, keyboard navigation, results. */
const SearchPanel = ({ onClose }: Props) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { hits, status } = useHits(useDeferredValue(query));

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      setActive(step(active, delta, hits.length));
      document.querySelector(`#${resultId(step(active, delta, hits.length))}`)?.scrollIntoView({
        block: "nearest",
      });
    }
    const hit = hits[active];
    if (hit === undefined || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onClose();
    void navigate(hitPath(hit));
  };

  return (
    <>
      <label className="flex items-center gap-2.5 border-b border-rule px-4 text-muted">
        <SearchIcon />
        <input
          aria-activedescendant={hits.length > 0 ? resultId(active) : undefined}
          aria-controls={hits.length > 0 ? "search-results" : undefined}
          aria-expanded={hits.length > 0}
          aria-label="Поиск по конспектам"
          autoFocus
          className="w-full bg-transparent py-3.5 text-[16px] text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Поиск: «4.3», «миноры»…"
          role="combobox"
          type="search"
          value={query}
        />
        <kbd className="rounded-sm border border-rule px-1.5 py-px text-[11px]">Esc</kbd>
      </label>
      <p className="px-5 text-[14px] text-muted not-empty:py-6" role="status">
        {status}
      </p>
      {hits.length > 0 && (
        <SearchResults active={active} hits={hits} onHover={setActive} onPick={onClose} />
      )}
    </>
  );
};

/**
A modal `<dialog>`: Esc and a click on the backdrop close it natively, so focus returns to the
button. The `close` event is queued: one left over from StrictMode's mount–unmount–mount arrives
when the dialog is already open again and is ignored.
*/
export const SearchDialog = ({ onClose }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      aria-label="Поиск"
      className="mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl border border-rule bg-card p-0 text-ink shadow-2xl backdrop:bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) {
          onClose();
        }
      }}
      ref={ref}
    >
      <SearchPanel onClose={onClose} />
    </dialog>
  );
};
