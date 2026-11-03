import { type ReactNode, useId, useState } from "react";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  /** Name for screen readers when the visible label is the same for many buttons («Показать ответ»). */
  readonly accessibleName?: string;
  readonly children: ReactNode;
  readonly closedLabel: string;
  readonly defaultOpen?: boolean;
  /** Mount the content only once opened (it loads data: the ticket generator's answers). */
  readonly lazy?: boolean;
  readonly openLabel: string;
};

/** A spoiler: the student tries first, then opens the answer or the solution. */
export const Reveal = ({
  accessibleName,
  children,
  closedLabel,
  defaultOpen = false,
  lazy = false,
  openLabel,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={accessibleName}
        className="group/reveal inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-rule bg-card px-3.5 text-footnote font-semibold text-ink transition-colors hover:bg-wash"
        onClick={() => {
          setOpen((value) => !value);
        }}
        type="button"
      >
        {open ? openLabel : closedLabel}
        <span className="text-muted transition-transform duration-200 group-aria-expanded/reveal:rotate-90">
          <ChevronIcon size={14} />
        </span>
      </button>
      <div className="order-last min-w-0 basis-full pt-1 empty:hidden" hidden={!open} id={panelId}>
        {(open || !lazy) && children}
      </div>
    </>
  );
};
