import { useState } from "react";
import { useParams } from "react-router";

import { useDocMeta, useFragment, useLabelIndex } from "#web/api/queries.ts";
import { notFound, useCourse } from "#web/api/use-course.ts";
import { neighbours } from "#web/domain/lectures.ts";
import { sectionNumbers } from "#web/domain/sections.ts";
import { readingMinutes } from "#web/domain/text.ts";
import { FragmentView } from "#web/shared/reader/fragment-view.tsx";
import { useScrollToHash } from "#web/shared/reader/use-scroll-to-hash.ts";
import { DocToc } from "#web/shared/ui/doc-toc.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";
import { MenuIcon } from "#web/shared/ui/icons.tsx";
import { useIsMatching } from "#web/shared/ui/use-is-matching.ts";

import { LectureHeader } from "./lecture-header.tsx";
import { PrevNext } from "./prev-next.tsx";

const WIDE_QUERY = "(min-width: 1100px)";
const NOT_BLOCKS = new Set(["equation", "figure", "section"]);

const useLecture = () => {
  const params = useParams();
  const { info, lectures } = useCourse(params["course"]);
  const entry = lectures.find((lecture) => lecture.weekId === params["weekId"]) ?? notFound();
  const meta = useDocMeta(info.id, entry.weekId);
  const html = useFragment(info.id, entry.weekId);
  const index = useLabelIndex();
  const labels = Object.values(index[info.id] ?? {}).filter(
    (label) => label.weekId === entry.weekId,
  );
  return { entry, html, info, labels, lectures, meta };
};

export const Component = () => {
  const { entry, html, info, labels, lectures, meta } = useLecture();
  const { next, prev } = neighbours(lectures, entry.weekId);

  useDocumentTitle(`${info.name}, лекция ${String(meta.lecture)}: ${meta.title}`);
  useScrollToHash();

  const isWide = useIsMatching(WIDE_QUERY);
  const [isTocOpen, setIsTocOpen] = useState(false);

  // One table of contents is mounted: the sticky column on wide screens, the folded block otherwise.
  const toc = (
    <DocToc
      caption={`Лекция ${String(meta.lecture)}`}
      minutes={readingMinutes(html)}
      onNavigate={() => {
        setIsTocOpen(false);
      }}
      toc={meta.toc}
    />
  );

  return (
    <div className="mx-auto grid max-w-[1240px] justify-center gap-14 px-4 min-[1100px]:grid-cols-[230px_minmax(0,800px)] sm:px-8">
      <div className="sticky top-6 hidden max-h-[calc(100vh-3rem)] self-start overflow-y-auto pt-14 min-[1100px]:block">
        {isWide && toc}
      </div>
      <div className="min-w-0">
        <LectureHeader
          blocks={labels.filter((label) => !NOT_BLOCKS.has(label.type)).length}
          course={info.id}
          courseName={info.name}
          meta={meta}
          weekId={entry.weekId}
        />
        <details
          className="group mt-5 rounded-lg border border-rule bg-card min-[1100px]:hidden"
          onToggle={(event) => {
            setIsTocOpen(event.currentTarget.open);
          }}
          open={isTocOpen}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <MenuIcon size={16} />
            Оглавление
          </summary>
          <div className="border-t border-rule p-4">{!isWide && toc}</div>
        </details>
        <FragmentView
          course={info.id}
          docId={entry.weekId}
          html={html}
          lecture={meta.lecture}
          sectionNumbers={sectionNumbers(meta.toc, meta.lecture)}
        />
        <PrevNext course={info.id} next={next} prev={prev} />
      </div>
    </div>
  );
};
