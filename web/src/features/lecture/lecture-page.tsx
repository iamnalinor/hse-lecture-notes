import { Navigate, useLocation, useParams } from "react-router";

import type { CourseInfo } from "#web/domain/courses.ts";
import type { LectureEntry } from "#web/domain/schemas.ts";

import { useDocMeta, useFragment } from "#web/api/queries.ts";
import { notFound, useCourse } from "#web/api/use-course.ts";
import { neighbours, resolveLecture } from "#web/domain/lectures.ts";
import { paths } from "#web/domain/paths.ts";
import { sectionNumbers } from "#web/domain/sections.ts";
import { readingMinutes } from "#web/domain/text.ts";
import { FragmentView } from "#web/shared/reader/fragment-view.tsx";
import { useScrollToHash } from "#web/shared/reader/use-scroll-to-hash.ts";
import { DocToc, WIDE_QUERY } from "#web/shared/ui/doc-toc.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";
import { TocSheet } from "#web/shared/ui/toc-sheet.tsx";
import { useIsMatching } from "#web/shared/ui/use-is-matching.ts";

import { LectureHeader } from "./lecture-header.tsx";
import { PrevNext } from "./prev-next.tsx";

type LectureProps = {
  readonly entry: LectureEntry;
  readonly info: CourseInfo;
  readonly lectures: readonly LectureEntry[];
};

/** A saved link with an outdated slug lands on the lecture with the same number (`resolveLecture`). */
export const Component = () => {
  const params = useParams();
  const { info, lectures } = useCourse(params["course"]);
  const { hash, search } = useLocation();
  const resolved = resolveLecture(lectures, params["weekId"] ?? "") ?? notFound();
  return resolved.exact ? (
    <LecturePage entry={resolved.entry} info={info} lectures={lectures} />
  ) : (
    <Navigate
      replace
      to={{ hash, pathname: paths.lecture(info.id, resolved.entry.weekId), search }}
    />
  );
};

const LecturePage = ({ entry, info, lectures }: LectureProps) => {
  const meta = useDocMeta(info.id, entry.weekId);
  const html = useFragment(info.id, entry.weekId);
  const { next, prev } = neighbours(lectures, entry.weekId);

  useDocumentTitle(`${info.name}, лекция ${String(meta.lecture)}: ${meta.title}`);
  useScrollToHash();

  const isWide = useIsMatching(WIDE_QUERY);
  const minutes = readingMinutes(html);
  const caption = `Лекция ${String(meta.lecture)}`;

  return (
    <div className="mx-auto grid max-w-[1240px] justify-center gap-14 px-4 min-[1100px]:grid-cols-[230px_minmax(0,800px)] sm:px-8">
      <div className="sticky top-6 hidden max-h-[calc(100vh-3rem)] self-start overflow-y-auto pt-14 min-[1100px]:block">
        {isWide && <DocToc caption={caption} minutes={minutes} toc={meta.toc} />}
      </div>
      <div className="min-w-0">
        <LectureHeader
          course={info.id}
          courseName={info.name}
          meta={meta}
          minutes={minutes}
          weekId={entry.weekId}
        />
        <FragmentView
          course={info.id}
          docId={entry.weekId}
          html={html}
          lecture={meta.lecture}
          sectionNumbers={sectionNumbers(meta.toc, meta.lecture)}
        />
        <PrevNext course={info.id} next={next} prev={prev} />
        <TocSheet caption={caption} minutes={minutes} toc={meta.toc} />
      </div>
    </div>
  );
};
