import type { ReactNode } from "react";

export const SectionTitle = ({ children }: { readonly children: ReactNode }) => (
  <h2 className="text-[34px] font-bold tracking-tight">{children}</h2>
);
