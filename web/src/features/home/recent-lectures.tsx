import { Link } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { LectureEntry } from "#web/domain/schemas.ts";

import { shortDate, weekStart } from "#web/domain/dates.ts";
import { paths } from "#web/domain/paths.ts";

export type RecentItem = { readonly course: CourseInfo; readonly lecture: LectureEntry };

const MAX_ROWS = 6;

/** A row whose next row is from an earlier week gets the stronger rule: the list reads in weeks. */
const ROW =
  "relative border-b last:border-0 max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:px-4.5 max-sm:py-3 hover:bg-wash/60";
const rowClass = (items: readonly RecentItem[], index: number): string => {
  const next = items[index + 1];
  const isLastOfWeek =
    next !== undefined &&
    weekStart(next.lecture.date) !== weekStart(items[index]?.lecture.date ?? "");
  return `${ROW} ${isLastOfWeek ? "border-ink/50" : "border-rule"}`;
};

/** The newest lectures that already took place, across all courses. */
export const recentItems = (all: readonly RecentItem[], today: string): readonly RecentItem[] =>
  all
    .filter((item) => item.lecture.date <= today)
    .toSorted((a, b) => b.lecture.date.localeCompare(a.lecture.date))
    .slice(0, MAX_ROWS);

export const RecentLectures = ({ items }: { readonly items: readonly RecentItem[] }) => (
  <div className="overflow-x-auto rounded-xl border border-rule bg-card">
    <table className="w-full border-collapse sm:min-w-140">
      <thead className="max-sm:sr-only">
        <tr>
          {["Курс", "Дата", "Тема"].map((title) => (
            <th
              className="border-b border-rule px-4.5 py-3 text-left text-footnote font-semibold text-muted"
              key={title}
              scope="col"
            >
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(({ course, lecture }, index) => (
          <tr className={rowClass(items, index)} key={`${course.id}/${lecture.weekId}`}>
            <td className="px-4.5 py-3.5 text-subhead whitespace-nowrap text-muted max-sm:p-0 max-sm:pr-3 max-sm:text-footnote">
              {course.short} · {lecture.lecture}
            </td>
            <td className="px-4.5 py-3.5 text-subhead whitespace-nowrap text-muted max-sm:p-0 max-sm:text-footnote">
              {shortDate(lecture.date)}
            </td>
            <td className="px-4.5 py-3.5 max-sm:col-span-2 max-sm:p-0 max-sm:pt-1">
              <Link
                className="text-body text-ink no-underline after:absolute after:inset-0 after:content-['']"
                to={paths.lecture(course.id, lecture.weekId)}
              >
                {lecture.title}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
