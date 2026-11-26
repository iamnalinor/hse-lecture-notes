import type { ReactNode } from "react";

import { Link } from "react-router";

import type { PdfDoc } from "#web/domain/preps.ts";

import { BUTTON_SECONDARY } from "./button.ts";
import { Crumbs } from "./crumbs.tsx";
import { PdfLink } from "./pdf-link.tsx";

type Props = {
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly course: string;
  readonly courseName: string;
  /** More PDFs next to the main one (cheatsheets of a test). */
  readonly downloads?: readonly PdfDoc[] | undefined;
  /** Last crumb and the title: «Теория». */
  readonly pageName: string;
  /** Document id of the PDF; omit when the page has none. */
  readonly pdfDoc?: string;
  /** Link to a section of the page next to the PDF button: «К генератору билетов». */
  readonly jump?: undefined | { readonly hash: string; readonly label: string };
};

const NO_DOWNLOADS: readonly PdfDoc[] = [];

/** Frame of a course-wide document page: crumbs, title, optional sticky side column and PDF button. */
export const DocPage = ({
  aside,
  children,
  course,
  courseName,
  downloads = NO_DOWNLOADS,
  pageName,
  jump,
  pdfDoc,
}: Props) => (
  <div
    className={`ai-grid mx-auto grid max-w-[1240px] justify-center gap-14 px-4 min-[1100px]:grid-cols-[230px_minmax(0,860px)] sm:px-8`}
  >
    <div className="ai-toc sticky top-6 hidden max-h-[calc(100vh-3rem)] self-start overflow-y-auto pt-14 min-[1100px]:block">
      {aside}
    </div>
    <div className="min-w-0 pb-20">
      <header>
        <Crumbs course={course} courseName={courseName} current={pageName} />
        <h1 className="mt-5.5 mb-4.5 text-title1 leading-[1.12] font-bold tracking-tight sm:text-large">
          {pageName}: {courseName.toLowerCase()}
        </h1>
        <div className="flex flex-wrap items-center gap-x-5.5 gap-y-2.5 border-b border-rule pb-6 text-footnote text-muted">
          {pdfDoc !== undefined && (
            <span className="ml-auto flex flex-wrap gap-2.5">
              {jump !== undefined && (
                <Link className={BUTTON_SECONDARY} to={{ hash: jump.hash }}>
                  {jump.label}
                </Link>
              )}
              {downloads.map((doc) => (
                <PdfLink
                  course={course}
                  docId={doc.docId}
                  key={doc.docId}
                  label={doc.label}
                  variant="button"
                />
              ))}
              <PdfLink course={course} docId={pdfDoc} variant="button" />
            </span>
          )}
        </div>
      </header>
      {children}
    </div>
  </div>
);
