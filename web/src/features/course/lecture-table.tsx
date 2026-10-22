import { Link } from "react-router";

import type { LectureEntry } from "#web/domain/schemas.ts";

import { shortDate } from "#web/domain/dates.ts";
import { paths } from "#web/domain/paths.ts";
import { PdfLink } from "#web/shared/ui/pdf-link.tsx";

type Props = {
  readonly course: string;
  /** Week id of the newest lecture that already took place. */
  readonly current: string | undefined;
  readonly lectures: readonly LectureEntry[];
};

const CELL = "border-b border-rule px-2 py-3.5 sm:px-3 align-top text-[15px]";

export const LectureTable = ({ course, current, lectures }: Props) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {["№", "Дата", "Тема", "PDF"].map((title) => (
            <th
              className={`border-b border-ink/40 px-2 py-2.5 text-left text-[12.5px] font-semibold whitespace-nowrap text-muted sm:px-3 ${title === "Дата" ? "max-sm:hidden" : ""}`}
              key={title}
              scope="col"
            >
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lectures.map((lecture) => (
          <tr key={lecture.weekId}>
            <td
              className={`${CELL} w-11 text-[22px] font-bold tabular-nums ${lecture.weekId === current ? "text-def" : "text-faint"}`}
            >
              {lecture.lecture}
            </td>
            <td
              className={`${CELL} w-17.5 whitespace-nowrap text-muted tabular-nums max-sm:hidden`}
            >
              {shortDate(lecture.date)}
            </td>
            <td className={CELL}>
              <Link
                className="text-[17px] leading-snug text-ink no-underline"
                to={paths.lecture(course, lecture.weekId)}
              >
                {lecture.title}
              </Link>
              {/* The date column does not fit on a phone: the date moves under the title. */}
              <span className="mt-1 block text-[13px] text-muted tabular-nums sm:hidden">
                {shortDate(lecture.date)}
              </span>
            </td>
            <td className={`${CELL} w-16`}>
              <PdfLink course={course} docId={lecture.weekId} variant="chip" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
