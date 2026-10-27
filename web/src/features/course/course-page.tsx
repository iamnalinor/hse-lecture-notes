import { Link, useParams } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";

import { useLabelIndex } from "#web/api/queries.ts";
import { useCourse } from "#web/api/use-course.ts";
import { COURSE_DOC_BUTTONS } from "#web/domain/course-docs.ts";
import { dayMonth } from "#web/domain/dates.ts";
import { latestLecture } from "#web/domain/lectures.ts";
import { paths } from "#web/domain/paths.ts";
import { isHighlighted, prepGoal, upcomingPreps } from "#web/domain/preps.ts";
import { labelStats } from "#web/domain/stats.ts";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";
import { useToday } from "#web/shared/ui/today.ts";

import { CourseSources, TEXT_LINK } from "./course-sources.tsx";
import { LectureTable } from "./lecture-table.tsx";

const BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-ink/40 px-3.5 py-2.5 text-sm font-semibold text-ink no-underline";

const ACCENT = `${BUTTON} border-org-fill bg-org-fill text-on-org-fill hover:border-org-fill-hover hover:bg-org-fill-hover`;

const ROW = "flex flex-wrap gap-2.5";

export const Component = () => {
  const { course: courseId } = useParams();
  const { hasProgram, info, lectures, preps } = useCourse(courseId);
  const stats = labelStats(Object.values(useLabelIndex()[info.id] ?? {}));
  const today = useToday();
  const current = latestLecture(lectures, today);
  const upcoming = upcomingPreps(preps, today);
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
            Лектор <LecturerLink info={info} />
          </span>
          <span>
            Лекции по <b className="font-semibold text-ink">{info.weekdayDative}</b>
          </span>
          <span>
            <b className="font-semibold text-ink">{stats.definitions}</b> определений ·{" "}
            <b className="font-semibold text-ink">{stats.theorems}</b> теорем
          </span>
        </div>
        {/* Row 1 — what every course has; row 2 — preps still ahead, nearest first (accent only near the event). */}
        <div className="mt-4 flex flex-col gap-2.5">
          <nav aria-label="Материалы курса" className={ROW}>
            {current !== undefined && (
              <Link
                className={`${BUTTON} border-ink bg-ink text-paper`}
                to={paths.lecture(info.id, current.weekId)}
              >
                Читать лекцию {current.lecture}{" "}
                <span className="font-normal">· {dayMonth(current.date)}</span>{" "}
                <span aria-hidden="true">→</span>
              </Link>
            )}
            <Link className={BUTTON} to={paths.theory(info.id)}>
              Теория
            </Link>
            <Link className={BUTTON} to={paths.glossary(info.id)}>
              Глоссарий
            </Link>
            {hasProgram && (
              <Link className={BUTTON} to={paths.program(info.id)}>
                {COURSE_DOC_BUTTONS.program}
              </Link>
            )}
          </nav>
          {upcoming.length > 0 && (
            <nav aria-label="Подготовка к контрольным" className={ROW}>
              {upcoming.map((prep) => (
                <Link
                  className={isHighlighted(prep, today) ? ACCENT : BUTTON}
                  key={prep.id}
                  to={paths.prep(info.id, prep.id)}
                >
                  {prepGoal(prep.id)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>
      <section className="py-9">
        <h2 className="mb-3.5 text-[13px] font-semibold tracking-[0.16em] text-muted uppercase">
          Лекции
        </h2>
        <LectureTable course={info.id} current={current?.weekId} lectures={lectures} />
      </section>
      <CourseSources course={info.id} />
    </div>
  );
};

/** The lecturer's name, linked to their profile on hse.ru. */
function LecturerLink({ info }: { readonly info: CourseInfo }) {
  return (
    <a className={TEXT_LINK} href={info.lecturerUrl} rel="noreferrer" target="_blank">
      {info.lecturer}
    </a>
  );
}
