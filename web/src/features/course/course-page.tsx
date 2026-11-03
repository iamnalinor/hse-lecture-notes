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
import { BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_SIGNAL } from "#web/shared/ui/button.ts";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";
import { useToday } from "#web/shared/ui/today.ts";

import { CourseSources, TEXT_LINK } from "./course-sources.tsx";
import { LectureTable } from "./lecture-table.tsx";

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
        <h1 className="mt-2.5 mb-3.5 text-large leading-none font-bold tracking-tight sm:text-display">
          {info.name}
        </h1>
        <p className="max-w-160 text-body/relaxed text-ink/80 sm:text-title3/relaxed">
          {info.summary}
        </p>
        <div className="mt-5.5 flex flex-wrap gap-x-6.5 gap-y-1 text-footnote text-muted">
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
        {/* One row of buttons, two lists: what every course has, then preps still ahead (signal fill only near the event). */}
        <div className="mt-6 flex flex-wrap gap-2">
          <nav aria-label="Материалы курса" className="contents">
            {current !== undefined && (
              <Link className={BUTTON_PRIMARY} to={paths.lecture(info.id, current.weekId)}>
                Читать лекцию {current.lecture}{" "}
                <span className="font-normal opacity-75">· {dayMonth(current.date)}</span>
              </Link>
            )}
            <Link className={BUTTON_SECONDARY} to={paths.theory(info.id)}>
              Теория
            </Link>
            <Link className={BUTTON_SECONDARY} to={paths.glossary(info.id)}>
              Глоссарий
            </Link>
            {hasProgram && (
              <Link className={BUTTON_SECONDARY} to={paths.program(info.id)}>
                {COURSE_DOC_BUTTONS.program}
              </Link>
            )}
          </nav>
          {upcoming.length > 0 && (
            <nav aria-label="Подготовка к контрольным" className="contents">
              {upcoming.map((prep) => (
                <Link
                  className={isHighlighted(prep, today) ? BUTTON_SIGNAL : BUTTON_SECONDARY}
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
        <h2 className="mb-2 text-title3 font-semibold">Лекции</h2>
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
