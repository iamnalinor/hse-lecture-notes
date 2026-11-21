import { Link } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { DocMeta, LectureEntry } from "#web/domain/schemas.ts";

import { paths } from "#web/domain/paths.ts";
import { ChevronIcon, ChevronLeftIcon } from "#web/shared/ui/icons.tsx";
import { PdfLink } from "#web/shared/ui/pdf-link.tsx";

type Props = {
  readonly info: CourseInfo;
  readonly meta: DocMeta;
  /** Rough reading time of the whole lecture. */
  readonly minutes: number;
  readonly next: LectureEntry | undefined;
  readonly prev: LectureEntry | undefined;
  readonly weekId: string;
};

/**
The lecture number is said once, in the switcher row: course · lecture · date on the left,
steps to the neighbours on the right. The title follows, then reading time and the PDF.
*/
export const LectureHeader = ({ info, meta, minutes, next, prev, weekId }: Props) => (
  <header>
    <nav
      aria-label="Лекции курса"
      className="flex items-center gap-3 pt-6 text-subhead text-muted lg:pt-12"
    >
      <p className="min-w-0 flex-1 truncate">
        <Link className="text-muted no-underline hover:text-ink" to={paths.course(info.id)}>
          {info.short}
        </Link>
        <span aria-hidden="true"> · </span>
        <span className="font-semibold text-ink">Лекция {meta.lecture}</span>
        <span aria-hidden="true"> · </span>
        {meta.dateRu}
      </p>
      <span className="flex shrink-0 overflow-hidden rounded-lg border border-rule bg-card">
        <Step course={info.id} dir="prev" lecture={prev} />
        <span aria-hidden="true" className="w-px bg-rule" />
        <Step course={info.id} dir="next" lecture={next} />
      </span>
    </nav>
    <h1 className="my-4 text-title2/tight font-bold tracking-tight text-balance sm:mt-5 sm:text-title1">
      {meta.title}
    </h1>
    <div className="flex items-center gap-4 text-footnote text-muted">
      <span>~{minutes} мин чтения</span>
      <span className="ml-auto">
        <PdfLink course={info.id} docId={weekId} variant="button" />
      </span>
    </div>
  </header>
);

const STEP =
  "flex h-10 min-w-12 items-center justify-center gap-1 px-2.5 text-subhead font-semibold tabular-nums no-underline";

/** One half of the switcher: an arrow and the neighbour's number, or a dimmed arrow at the ends. */
function Step({
  course,
  dir,
  lecture,
}: {
  readonly course: string;
  readonly dir: "next" | "prev";
  readonly lecture: LectureEntry | undefined;
}) {
  const arrow = dir === "prev" ? <ChevronLeftIcon size={16} /> : <ChevronIcon size={16} />;
  if (lecture === undefined) {
    return (
      <span aria-hidden="true" className={`${STEP} text-rule`}>
        {arrow}
      </span>
    );
  }
  const label = `${dir === "prev" ? "Предыдущая" : "Следующая"}: лекция ${String(lecture.lecture)}, ${lecture.title}`;
  return (
    <Link
      aria-label={label}
      className={`${STEP} text-ink hover:bg-wash`}
      title={label}
      to={paths.lecture(course, lecture.weekId)}
    >
      {dir === "prev" && arrow}
      {lecture.lecture}
      {dir === "next" && arrow}
    </Link>
  );
}
