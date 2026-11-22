import { Link } from "react-router";

import type { PrepEntry } from "#web/domain/schemas.ts";

import { paths } from "#web/domain/paths.ts";
import {
  chronologicalPreps,
  isDated,
  isHighlighted,
  isUpcoming,
  prepName,
  prepWhen,
} from "#web/domain/preps.ts";
import { BUTTON_SECONDARY, BUTTON_SIGNAL } from "#web/shared/ui/button.ts";

type Props = {
  readonly course: string;
  readonly preps: readonly PrepEntry[];
  readonly today: string;
};

const style = (prep: PrepEntry, today: string): string => {
  if (!isDated(prep)) {
    return BUTTON_SECONDARY;
  }
  if (!isUpcoming(prep, today)) {
    return `${BUTTON_SECONDARY} text-muted`;
  }
  return isHighlighted(prep, today) ? BUTTON_SIGNAL : BUTTON_SECONDARY;
};

/**
Every prep stays on the course page, in the order of the events (owner, 22.11.2026), each styled by
its state: ahead — with its day, accented near the event; no day yet — neutral; past — quieter, for
revision before the exam. The home page shows only those ahead with a day.
*/
export const PrepRow = ({ course, preps, today }: Props) =>
  preps.length === 0 ? null : (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <h2
        className="mr-1 basis-full text-footnote font-semibold text-muted sm:basis-auto"
        id="course-preps"
      >
        Подготовка
      </h2>
      <nav aria-labelledby="course-preps" className="flex flex-wrap items-center gap-2">
        {chronologicalPreps(preps).map((prep) => (
          <Link className={style(prep, today)} key={prep.id} to={paths.prep(course, prep.id)}>
            {prepName(prep.id, prep.quizNumber)}
            {isDated(prep) && isUpcoming(prep, today) && (
              <span className="font-normal"> · {prepWhen(prep)}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
