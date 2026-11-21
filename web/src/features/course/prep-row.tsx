import { Link } from "react-router";

import type { PrepEntry } from "#web/domain/schemas.ts";

import { paths } from "#web/domain/paths.ts";
import { isHighlighted, pastPreps, prepName, prepWhen, upcomingPreps } from "#web/domain/preps.ts";
import { BUTTON_SECONDARY, BUTTON_SIGNAL } from "#web/shared/ui/button.ts";

type Props = {
  readonly course: string;
  readonly preps: readonly PrepEntry[];
  readonly today: string;
};

/**
Every prep stays on the course page: those ahead first with their day (accented near the event),
then past ones, quieter, for revision before the exam. The home page shows only those ahead.
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
      <nav aria-labelledby="course-preps" className="contents">
        {upcomingPreps(preps, today).map((prep) => (
          <Link
            className={isHighlighted(prep, today) ? BUTTON_SIGNAL : BUTTON_SECONDARY}
            key={prep.id}
            to={paths.prep(course, prep.id)}
          >
            {prepName(prep.id)} <span className="font-normal">· {prepWhen(prep)}</span>
          </Link>
        ))}
        {pastPreps(preps, today).map((prep) => (
          <Link
            className={`${BUTTON_SECONDARY} text-muted`}
            key={prep.id}
            to={paths.prep(course, prep.id)}
          >
            {prepName(prep.id)}
          </Link>
        ))}
      </nav>
    </div>
  );
