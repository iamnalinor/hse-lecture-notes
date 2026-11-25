import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { useEffect, useId, useLayoutEffect, useState } from "react";

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
    return (
      <span aria-hidden="true" className="group-hover:text-def">
        {title}
      </span>
    );
  }
  const cut = title.trimEnd().lastIndexOf(" ");
  const head = cut === -1 ? "" : title.slice(0, cut + 1);
  const last = cut === -1 ? title : title.slice(cut + 1);
  return (
    <>
      <span aria-hidden="true" className="group-hover:text-def">
        {head}
      </span>
      <span className="whitespace-nowrap" data-testid="title-tail">
        <span aria-hidden="true" className="group-hover:text-def">
          {last}
        </span>
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
  const [shownBy, setShownBy] = useState<"click" | "hover" | null>(null);
  const isOpen = shownBy !== null;
  const tipId = useId();
  const [tick, setTick] = useState<HTMLElement | null>(null);
  const [tip, setTip] = useState<HTMLElement | null>(null);
  const { floatingStyles, update } = useFloating({
    elements: { floating: tip, reference: tick },
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    open: isOpen,
    placement: "top",
    strategy: "fixed",
  });
  useLayoutEffect(() => {
    return isOpen && tick !== null && tip !== null ? autoUpdate(tick, tip, update) : undefined;
  }, [isOpen, tick, tip, update]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && tick?.contains(event.target) === false) {
        setShownBy(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShownBy(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [isOpen, tick]);
  return (
    <>
      <button
        aria-controls={tipId}
        aria-expanded={isOpen}
        aria-label={syncedHint(synced) ?? undefined}
        className="relative z-10 ml-1.5 inline-flex cursor-pointer items-center justify-center align-middle text-ex after:absolute after:-inset-2"
        onBlur={() => {
          setShownBy(null);
        }}
        onClick={() => {
          setShownBy(shownBy === "click" ? null : "click");
        }}
        onPointerEnter={(event) => {
          if (shownBy === null && event.pointerType === "mouse") {
            setShownBy("hover");
          }
        }}
        onPointerLeave={() => {
          if (shownBy === "hover") {
            setShownBy(null);
          }
        }}
        ref={setTick}
        type="button"
      >
        <CheckIcon size={14} />
      </button>
      <span
        aria-hidden={!isOpen}
        className="pointer-events-none z-50 max-w-64 rounded-lg bg-ink px-3 py-2 text-left text-footnote/snug font-normal whitespace-normal text-paper shadow-lg"
        data-popover=""
        data-state={isOpen ? "open" : "closed"}
        id={tipId}
        ref={setTip}
        role="tooltip"
        style={floatingStyles}
      >
        {syncedHint(synced)}
      </span>
    </>
  );
};
