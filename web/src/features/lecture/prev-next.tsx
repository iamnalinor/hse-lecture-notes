import { Link } from "react-router";

import type { LectureEntry } from "#web/domain/schemas.ts";

import { shortDate } from "#web/domain/dates.ts";
import { paths } from "#web/domain/paths.ts";
import { ChevronIcon, ChevronLeftIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  readonly course: string;
  readonly next: LectureEntry | undefined;
  readonly prev: LectureEntry | undefined;
};

const CARD =
  "group flex h-full items-center gap-3 rounded-xl border border-rule bg-card px-4 py-4 text-ink no-underline transition-colors hover:border-ink/30";

/** Cards to the neighbouring lectures at the end of the text: direction, number and date, then the title. */
export const PrevNext = ({ course, next, prev }: Props) => (
  <nav
    aria-label="Соседние лекции"
    className="mt-14 mb-20 grid auto-rows-fr gap-3 border-t border-rule pt-7 sm:grid-cols-2"
  >
    {prev === undefined ? (
      <span className="hidden sm:block" />
    ) : (
      <Link className={CARD} to={paths.lecture(course, prev.weekId)}>
        <span className="shrink-0 text-muted group-hover:text-ink">
          <ChevronLeftIcon size={20} />
        </span>
        <Card dir="Предыдущая" lecture={prev} />
      </Link>
    )}
    {next !== undefined && (
      <Link className={`${CARD} sm:text-right`} to={paths.lecture(course, next.weekId)}>
        <Card dir="Следующая" lecture={next} />
        <span className="shrink-0 text-muted group-hover:text-ink">
          <ChevronIcon size={20} />
        </span>
      </Link>
    )}
  </nav>
);

function Card({ dir, lecture }: { readonly dir: string; readonly lecture: LectureEntry }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="mb-1 block text-footnote text-muted">
        {dir} · лекция {lecture.lecture} · {shortDate(lecture.date)}
      </span>
      <span className="line-clamp-2 text-subhead/snug font-semibold">{lecture.title}</span>
    </span>
  );
}
