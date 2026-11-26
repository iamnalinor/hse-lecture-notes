import { type ReactNode, useId, useState } from "react";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  /** Name for screen readers when the visible label is the same for many buttons («Ответ»). */
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
        className="group/reveal inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-rule bg-card px-3.5 text-footnote font-semibold text-ink transition-colors duration-150 hover:bg-wash"
        onClick={() => {
          setOpen((value) => !value);
        }}
        type="button"
      >
        {open ? openLabel : closedLabel}
        <span className="text-muted transition-transform duration-200 ease-out group-aria-expanded/reveal:rotate-90">
          <ChevronIcon size={14} />
        </span>
      </button>
      {/* Folded by a grid row (0fr → 1fr): the height animates without measuring. `visibility` keeps the
      closed content out of the tab order and the accessibility tree once the fold has finished. */}
      <div
        className="order-last grid min-w-0 basis-full grid-rows-[0fr] transition-[grid-template-rows,visibility] duration-250 ease-out data-open:grid-rows-[1fr]"
        data-open={open ? "" : undefined}
        id={panelId}
        style={open ? undefined : { visibility: "hidden" }}
      >
        <div className="min-h-0 overflow-clip">
          <div className="pt-2.5">{(open || !lazy) && children}</div>
        </div>
      </div>
    </>
  );
};
