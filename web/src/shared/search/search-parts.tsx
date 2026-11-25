import { useState } from "react";

import type { SearchHit } from "#web/domain/search.ts";

import { CloseIcon, SearchIcon } from "#web/shared/ui/icons.tsx";

import { resultId, SearchResults } from "./search-results.tsx";

const isMac = (): boolean => /Mac|iPhone|iPad/u.test(navigator.userAgent);

type FieldProps = {
  readonly active: number;
  readonly fieldRef: React.RefObject<HTMLInputElement | null>;
  readonly hasPanel: boolean;
  readonly isTabbable: boolean;
  readonly onClear: () => void;
  readonly onFocus: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent) => void;
  readonly onQuery: (query: string) => void;
  readonly query: string;
};

export const SearchField = ({
  active,
  fieldRef,
  hasPanel,
  isTabbable,
  onClear,
  onFocus,
  onKeyDown,
  onQuery,
  query,
}: FieldProps) => (
  <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-rule bg-card px-3 text-faint transition-colors duration-150 focus-within:border-ink/40 focus-within:text-ink md:w-64 lg:h-10 lg:w-96">
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
      placeholder="Поиск"
      ref={fieldRef}
      role="combobox"
      tabIndex={isTabbable ? undefined : -1}
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
        className="-my-px -mr-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:text-ink lg:size-10"
        onClick={onClear}
        type="button"
      >
        <CloseIcon size={16} />
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

type PopoverProps = {
  readonly children: React.ReactNode;
  readonly isOpen: boolean;
};

/**
Right under the bar: full width on a phone, a dropdown under the field on a wide screen. It fades and
scales 0.98 → 1 in 150ms both ways (`[data-popover]` in `app.css`). To fade out it must stay in the DOM
after its content is gone, so it keeps the last content while closed; closed it is `display: none`,
`inert` and hidden from assistive technology.
*/
export const Popover = ({ children, isOpen }: PopoverProps) => {
  const [kept, setKept] = useState<React.ReactNode>(undefined);
  if (isOpen && kept !== children) {
    setKept(children);
  }
  return kept === undefined ? null : (
    <div
      aria-hidden={!isOpen}
      className="absolute inset-x-0 top-full z-50 border-b border-rule bg-card shadow-[0_12px_24px_-16px_rgba(0,0,0,0.35)] lg:mt-1 lg:rounded-xl lg:border"
      data-popover=""
      data-state={isOpen ? "open" : "closed"}
      inert={!isOpen}
    >
      {kept}
    </div>
  );
};

export const SearchPanel = ({
  active,
  hits,
  limit,
  onHover,
  onMore,
  onPick,
  status,
}: PanelProps) => (
  <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-[inherit]">
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
  readonly magnifierRef: React.RefObject<HTMLButtonElement | null>;
  readonly onCancel: () => void;
  readonly onOpen: () => void;
};

/**
On a phone the bar keeps one row: a magnifier button sits next to the courses, and a tap unfolds the
field over that row with «Отмена» to fold it back. Folded, the field is `sr-only`, not
`hidden`: the tap focuses it right away, so iOS raises the keyboard. From `md` up the field is always in the bar.
*/
export const PhoneFold = ({ children, isOpen, magnifierRef, onCancel, onOpen }: PhoneProps) => (
  <>
    <button
      aria-label="Поиск"
      className={`size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-ink min-[21rem]:hidden ${isOpen ? "hidden" : "flex"}`}
      onClick={onOpen}
      ref={magnifierRef}
      type="button"
    >
      <SearchIcon size={20} />
    </button>
    <div
      className={
        isOpen
          ? "max-[21rem]:absolute max-[21rem]:inset-0 max-[21rem]:z-50 max-[21rem]:flex max-[21rem]:items-center max-[21rem]:gap-1 max-[21rem]:bg-paper max-[21rem]:pr-2 max-[21rem]:pl-4 max-[21rem]:opacity-100 max-[21rem]:transition-opacity max-[21rem]:duration-150"
          : "max-[21rem]:sr-only max-[21rem]:opacity-0"
      }
    >
      {children}
      {isOpen && (
        <button
          className="h-11 shrink-0 cursor-pointer rounded-lg px-3 text-subhead text-muted hover:text-ink min-[21rem]:hidden"
          onClick={onCancel}
          type="button"
        >
          Отмена
        </button>
      )}
    </div>
  </>
);
