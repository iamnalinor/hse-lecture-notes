import type { ReactNode } from "react";

import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly children: ReactNode;
  /** «Доказательство теоремы 5.3.» when the proof has a title; plain «Доказательство.» otherwise. */
  readonly label?: ReactNode;
};

export const Proof = ({ children, label }: Props) => (
  <details className="group mb-7 rounded-xl border border-rule" open>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 hover:bg-rule/40 [&::-webkit-details-marker]:hidden">
      <span className="italic">{label ?? "Доказательство."}</span>
      <span className="ml-auto text-muted transition-transform duration-200 group-open:rotate-90">
        <ChevronIcon size={16} />
      </span>
    </summary>
    <div className="border-t border-rule px-4 pt-3">
      <div className="proof-content">{children}</div>
      <div aria-hidden="true" className="proof-qed-block" />
    </div>
  </details>
);

/** A short proof: the PDF's run-in «Доказательство.», no frame and nothing to fold. */
export const ShortProof = ({ children }: Pick<Props, "children">) => (
  <div className="mb-7">
    <div className="proof-content">{children}</div>
    <div aria-hidden="true" className="proof-qed-block" />
  </div>
);
