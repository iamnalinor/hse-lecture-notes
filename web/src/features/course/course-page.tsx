import { Link, useParams } from "react-router";

import { useLabelIndex } from "#web/api/queries.ts";
import { useCourse } from "#web/api/use-course.ts";
import { shortDate } from "#web/domain/dates.ts";
import { latestLecture } from "#web/domain/lectures.ts";
import { paths } from "#web/domain/paths.ts";
import { isUpcoming, prepName } from "#web/domain/preps.ts";
import { labelStats } from "#web/domain/stats.ts";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";
import { useToday } from "#web/shared/ui/today.ts";

import { LectureTable } from "./lecture-table.tsx";

const BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-ink/40 px-3.5 py-2.5 text-sm font-semibold text-ink no-underline";

export const Component = () => {
  const { course: courseId } = useParams();
  const { info, lectures, preps } = useCourse(courseId);
  const stats = labelStats(Object.values(useLabelIndex()[info.id] ?? {}));
  const today = useToday();
  const current = latestLecture(lectures, today);
  useDocumentTitle(info.name);

  return (
    <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
      <section className="border-b border-rule py-10 lg:pt-14">
        <div className="text-[13px] font-semibold tracking-[0.14em] text-def uppercase">Курс</div>
        <h1 className="mt-2.5 mb-3.5 text-[40px] leading-none font-bold tracking-tight sm:text-[56px]">
          {info.name}
        </h1>
        <p className="max-w-160 text-xl/relaxed text-ink/80">{info.summary}</p>
        <div className="mt-5.5 flex flex-wrap gap-x-6.5 gap-y-1 text-sm text-muted">
          <span>
            Лектор <b className="font-semibold text-ink">{info.lecturer}</b>
          </span>
          <span>
            Лекции по <b className="font-semibold text-ink">{info.weekdayDative}</b>
          </span>
          <span>
            <b className="font-semibold text-ink">{stats.definitions}</b> определений ·{" "}
            <b className="font-semibold text-ink">{stats.theorems}</b> теорем
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {current !== undefined && (
            <Link
              className={`${BUTTON} border-ink bg-ink text-paper`}
              to={paths.lecture(info.id, current.weekId)}
            >
              Читать лекцию {current.lecture} →
            </Link>
          )}
          {preps.map((prep) => (
            <Link
              className={
                isUpcoming(prep, today)
                  ? `${BUTTON} border-org-fill bg-org-fill text-on-org-fill hover:bg-org-fill-hover`
                  : BUTTON
              }
              key={prep.id}
              to={paths.prep(info.id, prep.id)}
            >
              Подготовка к {prepName(prep.id)}
              {isUpcoming(prep, today) && (
                <span className="font-normal">· {shortDate(prep.date)}</span>
              )}
            </Link>
          ))}
          <Link className={BUTTON} to={paths.theory(info.id)}>
            Теория
          </Link>
          <Link className={BUTTON} to={paths.glossary(info.id)}>
            Глоссарий
          </Link>
        </div>
      </section>
      <section className="py-9 pb-20">
        <h2 className="mb-3.5 text-[13px] font-semibold tracking-[0.16em] text-muted uppercase">
          Лекции
        </h2>
        <LectureTable course={info.id} current={current?.weekId} lectures={lectures} />
      </section>
    </div>
  );
};
