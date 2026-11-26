import type { ReactNode } from "react";

import { Reveal } from "./reveal.tsx";

type Props = { readonly solution: ReactNode };

/** The problem card's tail: the solution, its answer in the last line, waits for a click. */
export const ProblemFooter = ({ solution }: Props) =>
  solution === undefined ? null : (
    <div className="flex flex-wrap items-center gap-x-2.5 px-5 pt-1 pb-4">
      <Reveal closedLabel="Решение" openLabel="Решение">
        <div>{solution}</div>
      </Reveal>
    </div>
  );
