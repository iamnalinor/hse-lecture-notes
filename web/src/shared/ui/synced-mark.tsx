import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { useState } from "react";

import { syncedHint, type SyncedPart } from "#web/domain/synced.ts";
import { CheckIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly synced: readonly SyncedPart[];
  readonly title: string;
};

/**
A lecture title; when the note was checked against the real lecture or seminars, a small green tick follows it.
The tick sits in one `nowrap` span with the last word, so a wrapped title never leaves it alone on a line.
*/
export const SyncedTitle = ({ synced, title }: Props) => {
  const hint = syncedHint(synced);
  if (hint === null) {
    return <>{title}</>;
  }
  const cut = title.trimEnd().lastIndexOf(" ");
  const head = cut === -1 ? "" : title.slice(0, cut + 1);
  const last = cut === -1 ? title : title.slice(cut + 1);
  return (
    <>
      {head}
      <span className="whitespace-nowrap" data-testid="title-tail">
        {last}
        <SyncedTick synced={synced} />
      </span>
    </>
  );
};

/**
The tick with a tooltip on hover. It sits above the stretched row link (`relative z-10`), or the link
would take the hover; the tooltip is `fixed`, so the table's scroll box does not cut it off.
*/
const SyncedTick = ({ synced }: { readonly synced: readonly SyncedPart[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tick, setTick] = useState<HTMLElement | null>(null);
  const [tip, setTip] = useState<HTMLElement | null>(null);
  const { floatingStyles } = useFloating({
    elements: { floating: tip, reference: tick },
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    open: isOpen,
    placement: "top",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });
  return (
    <span
      className="relative z-10 ml-1.5 inline-block align-middle text-ex"
      onMouseEnter={() => {
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        setIsOpen(false);
      }}
      ref={setTick}
    >
      <CheckIcon size={14} />
      <span className="sr-only">{syncedHint(synced)}</span>
      {isOpen && (
        <span
          aria-hidden="true"
          className="pointer-events-none z-50 max-w-64 rounded-lg bg-ink px-3 py-2 text-left text-footnote/snug font-normal whitespace-normal text-paper shadow-lg"
          ref={setTip}
          style={floatingStyles}
        >
          {syncedHint(synced)}
        </span>
      )}
    </span>
  );
};
