import { useEffect, useId, useRef, useState } from "react";

import type { TocItem } from "#web/domain/schemas.ts";

import { tocItems, TocList, WIDE_QUERY } from "./doc-toc.tsx";
import { MenuIcon } from "./icons.tsx";
import { useActiveSection } from "./use-active-section.ts";
import { useIsMatching } from "./use-is-matching.ts";
import { useReadingProgress } from "./use-reading-progress.ts";

type Props = {
  readonly caption: string;
  readonly minutes: number;
  readonly toc: readonly TocItem[];
};

/**
On a phone a long document has no side column: a floating pill at the bottom names the section being
read and how far along the reader is, and opens the table of contents as a sheet. Hidden while the
back bar after a reference jump is shown (`app.css`): both live at the bottom edge. The page mounts
the side-column `DocToc` only on wide screens, so this is the page's one `useActiveSection`.
*/
export const TocSheet = ({ caption, minutes, toc }: Props) => {
  const isWide = useIsMatching(WIDE_QUERY);
  return isWide ? null : <Sheet caption={caption} minutes={minutes} toc={toc} />;
};

const Sheet = ({ caption, minutes, toc }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const sheetId = useId();
  const items = tocItems(toc);
  const active = useActiveSection(items.map((item) => item.id));
  const progress = useReadingProgress();
  const current = items.find((item) => item.id === active);

  // Opening the sheet puts focus on the section being read, not on the sheet itself.
  useEffect(() => {
    if (isOpen) {
      ref.current?.querySelector<HTMLElement>('[aria-current="location"]')?.focus();
    }
  }, [isOpen]);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        data-toc-pill=""
      >
        <button
          aria-controls={sheetId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className="pointer-events-auto flex min-h-11 max-w-full cursor-pointer items-center gap-2.5 rounded-full border border-rule bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-4.5 text-footnote text-ink shadow-[0_8px_24px_-10px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150"
          onClick={() => {
            setIsOpen(true);
            ref.current?.showModal();
          }}
          type="button"
        >
          <MenuIcon size={16} />
          <span className="truncate font-semibold">{current?.text ?? caption}</span>
          <span className="text-muted tabular-nums">{Math.round(progress * 100)}%</span>
        </button>
      </div>
      {/* The padding is on the inner box: a click on the dialog element itself is the backdrop. */}
      <dialog
        aria-label="Оглавление"
        className="mx-0 mt-auto mb-0 max-h-[78vh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-xl border-t border-rule bg-card p-0 text-ink backdrop:bg-black/30 [&_li_a]:py-2.5"
        data-toc-sheet=""
        id={sheetId}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={() => {
          setIsOpen(false);
        }}
        ref={ref}
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <TocList
            active={active}
            caption={caption}
            minutes={minutes}
            onNavigate={() => {
              ref.current?.close();
            }}
            progress={progress}
            toc={toc}
          />
        </div>
      </dialog>
    </>
  );
};
