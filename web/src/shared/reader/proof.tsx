import type { ReactNode } from "react";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly children: ReactNode;
  readonly collapsed: boolean;
  /** «Доказательство теоремы 5.3.» when the proof has a title; plain «Доказательство.» otherwise. */
  readonly label?: ReactNode;
};

export const Proof = ({ children, collapsed, label }: Props) => (
  <details className="group -mt-1.5 mb-7" open={!collapsed}>
    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
      <span className="italic">{label ?? "Доказательство."}</span>
      <span className="text-muted transition-transform duration-200 group-open:rotate-90">
        <ChevronIcon size={16} />
      </span>
    </summary>
    <div className="pt-2">
      {children}
      <div className="float-right mt-[-1.6em]">∎</div>
      <div className="clear-both" />
    </div>
  </details>
);
