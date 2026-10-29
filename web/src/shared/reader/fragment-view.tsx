import parse from "html-react-parser";
import { useMemo } from "react";

import { dataUrl } from "#web/api/data-client.ts";

import { ReaderContext, type ReaderContextValue } from "./reader-context.ts";
import { createReplacer, type TransformOptions } from "./transform.tsx";

type Props = {
  readonly course: string;
  /** Directory of the document inside the data root: `<course>/<week_id>` or `<course>/theory`. */
  readonly docId: string;
  readonly html: string;
  readonly lecture: number | undefined;
  readonly nested?: boolean;
  readonly sectionNumbers?: ReadonlyMap<string, string>;
  /** Content mounted at the end of a section, by the section's id. */
  readonly slots?: TransformOptions["slots"] | undefined;
  readonly variant?: TransformOptions["variant"];
};

const NO_NUMBERS: ReadonlyMap<string, string> = new Map();
const NO_SLOTS: TransformOptions["slots"] = new Map();

/** Turns a build fragment (pandoc HTML) into React: blocks, references, KaTeX, spoilers. */
export const FragmentView = ({
  course,
  docId,
  html,
  lecture,
  nested = false,
  sectionNumbers = NO_NUMBERS,
  slots = NO_SLOTS,
  variant = "notes",
}: Props) => {
  const content = useMemo(
    () =>
      parse(html, {
        replace: createReplacer({
          assetBase: dataUrl(`${course}/${docId}/`),
          sectionNumbers,
          slots,
          variant,
        }),
      }),
    [course, docId, html, sectionNumbers, slots, variant],
  );

  const context = useMemo<ReaderContextValue>(
    () => ({
      course,
      lecture,
      nested,
      renderPreview: (preview, previewDocId) => (
        <FragmentView
          course={course}
          docId={previewDocId}
          html={preview}
          lecture={lecture}
          nested
        />
      ),
    }),
    [course, lecture, nested],
  );

  return (
    <ReaderContext value={context}>
      <div className="prose-notes">{content}</div>
    </ReaderContext>
  );
};
