import type { ReactNode } from "react";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly children: ReactNode;
  /** «Доказательство теоремы 5.3.» when the proof has a title; plain «Доказательство.» otherwise. */
  readonly label?: ReactNode;
};

export const Proof = ({ children, label }: Props) => (
  <details className="group -mt-1.5 mb-7" open>
    <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-md py-0.5 pr-1.5 hover:bg-rule/40 [&::-webkit-details-marker]:hidden">
      <span className="italic">{label ?? "Доказательство."}</span>
      <span className="flex size-6 items-center justify-center rounded-full border border-rule text-muted">
        <span className="transition-transform duration-200 group-open:rotate-90">
          <ChevronIcon size={14} />
        </span>
      </span>
    </summary>
    <div className="pt-2">
      <div className="proof-content">{children}</div>
      <div aria-hidden="true" className="proof-qed-block" />
    </div>
  </details>
);
