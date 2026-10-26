import { Link } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { LectureEntry, PrepEntry } from "#web/domain/schemas.ts";

import { shortDate } from "#web/domain/dates.ts";
import { latestLecture } from "#web/domain/lectures.ts";
import { paths } from "#web/domain/paths.ts";
import {
  isHighlighted,
  prepGoal,
  prepName,
  prepWhen,
  upcomingPreps,
} from "#web/domain/preps.ts";
import { plural } from "#web/domain/text.ts";
import { TexMath } from "#web/shared/reader/tex-math.tsx";
import { ArrowUpRightIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly course: CourseInfo;
  readonly lectures: readonly LectureEntry[];
  readonly preps: readonly PrepEntry[];
  readonly today: string;
};

const TILE = "relative z-10 block h-full rounded-lg px-3 py-2.5 no-underline transition-colors";

/** Accent only near the event (`isHighlighted`), before that an outlined tile like the course page's buttons. */
const PREP_TILE = {
  accent: `${TILE} border border-org-fill bg-org-fill text-on-org-fill hover:border-org-fill-hover hover:bg-org-fill-hover`,
  neutral: `${TILE} border border-ink/40 bg-card text-ink hover:bg-wash`,
};

/**
The whole card links to the course: the title link is stretched over it. The card spans three
rows of the section's grid (subgrid), so the rule under the title, the lecture tile and the test
tile line up across the cards of a row instead of floating with the title's length.
*/
export const CourseCard = ({ course, lectures, preps, today }: Props) => {
  const last = latestLecture(lectures, today);
  const next = upcomingPreps(preps, today)[0];
  const accent = next !== undefined && isHighlighted(next, today);
  return (
    <article className="group relative row-span-3 grid cursor-pointer grid-rows-subgrid gap-0 overflow-hidden rounded-xl border border-rule bg-card transition-colors hover:bg-wash/50 has-[[data-tile]:hover]:bg-card has-[h3_a:focus-visible]:ring-2 has-[h3_a:focus-visible]:ring-brand">
      <div className="flex min-h-32.5 flex-col border-b border-rule px-5.5 pt-5.5 pb-4.5">
        <span aria-hidden="true" className="absolute top-4.5 right-5 text-[26px] text-faint">
          <TexMath display={false} tex={course.symbol} />
        </span>
        <span className="text-[12.5px] tracking-wider text-muted uppercase">{course.weekday}</span>
        <h3 className="mt-2.5 mb-1.5 max-w-55 text-[25px] leading-tight font-bold">
          <Link
            className="text-ink no-underline after:absolute after:inset-0 after:content-['']"
            to={paths.course(course.id)}
          >
            {course.name}
          </Link>
        </h3>
        <span className="mt-auto flex items-center justify-between gap-3 text-[13.5px] text-muted">
          <span>
            {course.lecturer} · {lectures.length}{" "}
            {plural(lectures.length, ["лекция", "лекции", "лекций"])}
          </span>
          <span className="text-faint transition-colors group-hover:text-ink group-has-[[data-tile]:hover]:text-faint">
            <ArrowUpRightIcon size={18} />
          </span>
        </span>
      </div>
      <div className="px-5.5 py-4 empty:p-0">
        {last !== undefined && (
          <Link
            className={`${TILE} bg-wash text-ink hover:bg-rule/60`}
            data-tile
            to={paths.lecture(course.id, last.weekId)}
          >
            <small className="mb-0.5 block text-xs text-muted">
              Лекция {last.lecture} · {shortDate(last.date)}
            </small>
            <span className="text-[16px] leading-snug">{last.title}</span>
          </Link>
        )}
      </div>
      <div className="px-5.5 pb-4 empty:p-0">
        {next !== undefined && (
          <Link
            className={accent ? PREP_TILE.accent : PREP_TILE.neutral}
            data-tile
            to={paths.prep(course.id, next.id)}
          >
            <small className={`mb-0.5 block text-xs ${accent ? "" : "text-muted"}`}>
              {prepName(next.id)} · {prepWhen(next)}
            </small>
            <span className="text-[16px] leading-snug font-semibold">{prepGoal(next.id)} →</span>
          </Link>
        )}
      </div>
    </article>
  );
};
