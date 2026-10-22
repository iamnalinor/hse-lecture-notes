import { Link } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { LectureEntry } from "#web/domain/schemas.ts";

import { shortDate } from "#web/domain/dates.ts";
import { paths } from "#web/domain/paths.ts";

export type RecentItem = { readonly course: CourseInfo; readonly lecture: LectureEntry };

const MAX_ROWS = 6;

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
              className="border-b border-rule px-4.5 py-3 text-left text-[12.5px] font-semibold text-muted"
              key={title}
              scope="col"
            >
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(({ course, lecture }) => (
          <tr
            className="border-b border-rule last:border-0 max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:px-4.5 max-sm:py-3"
            key={`${course.id}/${lecture.weekId}`}
          >
            <td className="px-4.5 py-3.5 text-[14.5px] whitespace-nowrap text-muted max-sm:p-0 max-sm:pr-3 max-sm:text-[13px]">
              {course.short} · {lecture.lecture}
            </td>
            <td className="px-4.5 py-3.5 text-[14.5px] whitespace-nowrap text-muted max-sm:p-0 max-sm:text-[13px]">
              {shortDate(lecture.date)}
            </td>
            <td className="px-4.5 py-3.5 max-sm:col-span-2 max-sm:p-0 max-sm:pt-1">
              <Link
                className="text-[16.5px] text-ink no-underline"
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
