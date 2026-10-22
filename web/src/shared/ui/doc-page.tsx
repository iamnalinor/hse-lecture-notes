import type { ReactNode } from "react";

import { Crumbs } from "./crumbs.tsx";
import { PdfLink } from "./pdf-link.tsx";

type Props = {
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly course: string;
  readonly courseName: string;
  /** Line under the title: «120 терминов». */
  readonly note?: string;
  /** Last crumb and the title: «Теория». */
  readonly pageName: string;
  /** Document id of the PDF; omit when the page has none (glossary). */
  readonly pdfDoc?: string;
  /** Wider main column for pages that are lists, not reading (glossary). */
  readonly wide?: boolean;
};

/** Frame of a course-wide document page: crumbs, title, optional sticky side column and PDF button. */
export const DocPage = ({
  aside,
  children,
  course,
  courseName,
  note,
  pageName,
  pdfDoc,
  wide = false,
}: Props) => (
  <div
    className={`mx-auto grid justify-center gap-14 px-4 sm:px-8 ${wide ? "max-w-[1400px] min-[1100px]:grid-cols-[230px_minmax(0,1080px)]" : "max-w-[1240px] min-[1100px]:grid-cols-[230px_minmax(0,800px)]"}`}
  >
    <div className="sticky top-6 hidden max-h-[calc(100vh-3rem)] self-start overflow-y-auto pt-14 min-[1100px]:block">
      {aside}
    </div>
    <div className="min-w-0 pb-20">
      <header>
        <Crumbs course={course} courseName={courseName} current={pageName} />
        <h1 className="mt-5.5 mb-4.5 text-[32px] leading-[1.12] font-bold tracking-tight sm:text-[40px]">
          {pageName}: {courseName.toLowerCase()}
        </h1>
        <div className="flex flex-wrap items-center gap-x-5.5 gap-y-2.5 border-b border-rule pb-6 text-sm text-muted">
          {note !== undefined && <span>{note}</span>}
          {pdfDoc !== undefined && (
            <span className="ml-auto">
              <PdfLink course={course} docId={pdfDoc} variant="button" />
            </span>
          )}
        </div>
      </header>
      {children}
    </div>
  </div>
);
