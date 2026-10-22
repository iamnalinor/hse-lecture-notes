import type { DocMeta } from "#web/domain/schemas.ts";

import { Crumbs } from "#web/shared/ui/crumbs.tsx";
import { PdfLink } from "#web/shared/ui/pdf-link.tsx";

type Props = {
  readonly blocks: number;
  readonly course: string;
  readonly courseName: string;
  readonly meta: DocMeta;
  readonly weekId: string;
};

export const LectureHeader = ({ blocks, course, courseName, meta, weekId }: Props) => (
  <header>
    <Crumbs course={course} courseName={courseName} current={`Лекция ${String(meta.lecture)}`} />
    <div className="mt-5.5 text-[13px] font-semibold tracking-[0.14em] text-def uppercase">
      Лекция {meta.lecture} · {meta.dateRu}
    </div>
    <h1 className="mt-3.5 mb-4.5 text-[32px] leading-[1.12] font-bold tracking-tight sm:text-[40px]">
      {meta.title}
    </h1>
    <div className="flex flex-wrap items-center gap-x-5.5 gap-y-2.5 border-b border-rule pb-6.5 text-sm text-muted">
      <span>{blocks} блоков</span>
      <span className="ml-auto">
        <PdfLink course={course} docId={weekId} variant="button" />
      </span>
    </div>
  </header>
);
