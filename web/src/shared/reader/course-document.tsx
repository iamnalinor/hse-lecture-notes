import type { ReactNode } from "react";

import type { PdfDoc } from "#web/domain/preps.ts";

import { useDocMeta, useFragment } from "#web/api/queries.ts";
import { readingMinutes } from "#web/domain/text.ts";
import { DocPage } from "#web/shared/ui/doc-page.tsx";
import { DocToc } from "#web/shared/ui/doc-toc.tsx";

import { FragmentView } from "./fragment-view.tsx";
import { useScrollToHash } from "./use-scroll-to-hash.ts";

type Props = {
  /** Shown after the text: the ticket generator under «Пробный билет» of a colloquium page. */
  readonly after?: ReactNode;
  readonly course: string;
  readonly courseName: string;
  /** `theory`, `program`, `kr1`, `colloq1`… — the document directory and the PDF name. */
  readonly docId: string;
  /** More PDFs next to the document's own (cheatsheets of a test). */
  readonly downloads?: readonly PdfDoc[];
  readonly note: string;
  /** Crumb, title and TOC caption: «Теория», «Программа и оценивание», «Подготовка к КР-1». */
  readonly pageName: string;
  readonly variant: "prep" | "program" | "theory";
};

/** A course-wide document (theory, program, test preparation): TOC on the side, the fragment, the PDF button. */
export const CourseDocument = ({
  after,
  course,
  courseName,
  docId,
  downloads,
  note,
  pageName,
  variant,
}: Props) => {
  const meta = useDocMeta(course, docId);
  const html = useFragment(course, docId);
  useScrollToHash();

  return (
    <DocPage
      aside={<DocToc caption={pageName} minutes={readingMinutes(html)} toc={meta.toc} />}
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
        variant={variant}
      />
      {after}
    </DocPage>
  );
};
