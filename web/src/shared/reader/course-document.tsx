import type { ReactNode } from "react";

import type { PdfDoc } from "#web/domain/preps.ts";

import { useDocMeta, useFragment } from "#web/api/queries.ts";
import { readingMinutes } from "#web/domain/text.ts";
import { DocPage } from "#web/shared/ui/doc-page.tsx";
import { DocToc, useIsWideToc } from "#web/shared/ui/toc/document.tsx";
import { TocSheet } from "#web/shared/ui/toc/sheet.tsx";

import { FragmentView } from "./fragment-view.tsx";
import { useScrollToHash } from "./use-scroll-to-hash.ts";

type Props = {
  readonly course: string;
  readonly courseName: string;
  /** `theory`, `program`, `kr1`, `colloq1`… — the document directory and the PDF name. */
  readonly docId: string;
  /** More PDFs next to the document's own (cheatsheets of a test). */
  readonly downloads?: readonly PdfDoc[];
  readonly note: string;
  /** Crumb and title: «Теория», «План учебной дисциплины», «Подготовка к КР-1». */
  readonly pageName: string;
  /** TOC caption when the page name is long and would repeat the crumb right next to it: «КР-1». */
  readonly tocCaption?: string;
  /** Content mounted at the end of a section, by its id: the ticket generator in `sec:colloq1:generator`. */
  readonly slots?: ReadonlyMap<string, ReactNode>;
  readonly variant: "prep" | "program" | "theory";
};

/** A course-wide document (theory, program, test preparation): TOC on the side, the fragment, the PDF button. */
export const CourseDocument = ({
  course,
  courseName,
  docId,
  downloads,
  note,
  pageName,
  slots,
  tocCaption = pageName,
  variant,
}: Props) => {
  const meta = useDocMeta(course, docId);
  const html = useFragment(course, docId);
  useScrollToHash();
  const isWide = useIsWideToc();

  return (
    <DocPage
      aside={
        isWide && <DocToc caption={tocCaption} minutes={readingMinutes(html)} toc={meta.toc} />
      }
      course={course}
      courseName={courseName}
      downloads={downloads}
      note={note}
      pageName={pageName}
      pdfDoc={docId}
    >
      <FragmentView
        course={course}
        docId={docId}
        html={html}
        lecture={undefined}
        slots={slots}
        variant={variant}
      />
      <TocSheet caption={tocCaption} minutes={readingMinutes(html)} toc={meta.toc} />
    </DocPage>
  );
};
