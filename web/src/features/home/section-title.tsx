import type { ReactNode } from "react";

export const SectionTitle = ({ children }: { readonly children: ReactNode }) => (
  <h2 className="text-title1 font-bold tracking-tight">{children}</h2>
);
