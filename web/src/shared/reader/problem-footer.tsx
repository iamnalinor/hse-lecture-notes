import type { ReactNode } from "react";

import { Reveal } from "./reveal.tsx";

type Props = {
  readonly answer: ReactNode;
  /** Test preparation: the answer waits for a click too, so a reader cannot peek by accident. */
  readonly hideAnswer?: boolean;
  readonly solution: ReactNode;
};

/** The problem card's tail: the answer is open (unless `hideAnswer`), the solution waits for a click. */
export const ProblemFooter = ({ answer, hideAnswer = false, solution }: Props) => {
  if (answer === undefined && solution === undefined) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-dashed border-prob/35 px-4.5 py-2.5">
      {answer !== undefined && (
        <Reveal closedLabel="Показать ответ" defaultOpen={!hideAnswer} openLabel="Ответ">
          <div>{answer}</div>
        </Reveal>
      )}
      {solution !== undefined && (
        <Reveal closedLabel="Показать решение" openLabel="Решение">
          <div>{solution}</div>
        </Reveal>
      )}
      {solution !== undefined && <span className="text-xs text-faint">Сначала попробуй сам</span>}
    </div>
  );
};
