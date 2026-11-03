import type { DocMeta } from "#web/domain/schemas.ts";

import { Crumbs } from "#web/shared/ui/crumbs.tsx";
import { PdfLink } from "#web/shared/ui/pdf-link.tsx";

type Props = {
  readonly course: string;
  readonly courseName: string;
  readonly meta: DocMeta;
  /** Rough reading time of the whole lecture. */
  readonly minutes: number;
  readonly weekId: string;
};

export const LectureHeader = ({ minutes, course, courseName, meta, weekId }: Props) => (
  <header>
    <Crumbs course={course} courseName={courseName} current={`Лекция ${String(meta.lecture)}`} />
    <div className="mt-5.5 text-subhead font-semibold text-def">
      Лекция {meta.lecture} · {meta.dateRu}
    </div>
    <h1 className="mt-3.5 mb-4.5 text-title1 leading-[1.12] font-bold tracking-tight sm:text-large">
      {meta.title}
    </h1>
    <div className="flex flex-wrap items-center gap-x-5.5 gap-y-2.5 border-b border-rule pb-6.5 text-footnote text-muted">
      <span>~{minutes} мин чтения</span>
      <span className="ml-auto">
        <PdfLink course={course} docId={weekId} variant="button" />
      </span>
    </div>
  </header>
);
