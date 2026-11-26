import { Link } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { DocMeta, LectureEntry } from "#web/domain/schemas.ts";

import { paths } from "#web/domain/paths.ts";
import { syncedLabel } from "#web/domain/synced.ts";
import { CheckIcon, ChevronIcon, ChevronLeftIcon } from "#web/shared/ui/icons.tsx";
import { PdfLink } from "#web/shared/ui/pdf-link.tsx";

type Props = {
  readonly entry: LectureEntry;
  readonly info: CourseInfo;
  readonly meta: DocMeta;
  /** Rough reading time of the whole lecture. */
  readonly minutes: number;
  readonly next: LectureEntry | undefined;
  readonly prev: LectureEntry | undefined;
};

/**
The lecture number is said once, in the switcher row: course · lecture · date on the left,
steps to the neighbours on the right. The title follows, then reading time and the PDF.
*/
export const LectureHeader = ({ entry, info, meta, minutes, next, prev }: Props) => (
  <header>
    <nav
      aria-label="Лекции курса"
      className="flex items-center gap-3 pt-6 text-subhead text-muted lg:pt-12"
    >
      <p className="min-w-0 flex-1 text-pretty">
        <Link
          className="-my-3 inline-block py-3 text-muted no-underline hover:text-ink"
          to={paths.course(info.id)}
        >
          {info.short}
        </Link>
        <span aria-hidden="true"> ·&nbsp;</span>
        <span className="font-semibold text-ink">Лекция {meta.lecture}</span>
        <span aria-hidden="true"> ·&nbsp;</span>
        <span className="whitespace-nowrap">{meta.dateRu}</span>
      </p>
      <span className="flex shrink-0 overflow-hidden rounded-lg border border-rule bg-card">
        <Step course={info.id} dir="prev" lecture={prev} />
        <span aria-hidden="true" className="w-px bg-rule" />
        <Step course={info.id} dir="next" lecture={next} />
      </span>
    </nav>
    <h1 className="my-4 text-headline font-bold tracking-tight text-balance sm:mt-5 sm:text-title1">
      {meta.title}
    </h1>
    <div className="flex items-center gap-4 text-footnote text-muted">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <span>~{minutes} мин чтения</span>
        <SyncedLine entry={entry} />
      </div>
      <span className="shrink-0">
        <PdfLink course={info.id} docId={entry.weekId} variant="button" />
      </span>
    </div>
  </header>
);

/** «Сверено с лекцией…» with a green tick; nothing for a note that is not synced. */
const SyncedLine = ({ entry }: { readonly entry: LectureEntry }) => {
  const label = syncedLabel(entry.synced);
  return label === null ? null : (
    <span className="inline-flex items-center gap-1">
      <span className="text-ex">
        <CheckIcon size={14} />
      </span>
      {label}
    </span>
  );
};

const STEP =
  "flex h-11 min-w-12 items-center justify-center gap-1 px-2.5 text-subhead font-semibold tabular-nums no-underline";

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
