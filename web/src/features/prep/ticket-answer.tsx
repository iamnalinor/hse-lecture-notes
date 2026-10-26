import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import type { TicketRef } from "#web/domain/schemas.ts";

import { fragmentQuery, useLabelIndex } from "#web/api/queries.ts";
import { paths } from "#web/domain/paths.ts";
import { extractBlock } from "#web/shared/reader/extract-preview.ts";
import { FragmentView } from "#web/shared/reader/fragment-view.tsx";

type Props = {
  /** Own short answer (HTML), empty when the blocks say it all. */
  readonly answer: string;
  readonly course: string;
  /** The page the generator is on: its own blocks are linked by anchor. */
  readonly prepId: string;
  readonly refs: readonly TicketRef[];
  /** Show the proofs that follow the referenced statements (ticket parts with `proofs: true`). */
  readonly withProofs: boolean;
};

const LINK = "text-sm font-semibold text-def no-underline hover:underline";

type Ref = { readonly course: string; readonly blockRef: TicketRef };

/** One block of the answer, cut out of its document (a lecture or this page) and drawn in place. */
const AnswerBlock = ({
  blockRef,
  course,
  prepId,
  withProofs,
}: Pick<Props, "prepId" | "withProofs"> & Ref) => {
  const target = useLabelIndex()[course]?.[blockRef.id];
  const { data: html, isPending } = useQuery({
    ...fragmentQuery(course, blockRef.doc),
    select: (fragment) => extractBlock(fragment, blockRef.id, withProofs),
  });

  if (isPending) {
    return <p className="text-base text-muted">Загрузка…</p>;
  }
  return (
    <div>
      {html === undefined ? (
        <p className="text-base text-muted">Не удалось загрузить ответ.</p>
      ) : (
        <FragmentView
          course={course}
          docId={blockRef.doc}
          html={html}
          lecture={target?.lecture}
          variant="notes"
        />
      )}
      <div className="-mt-4 mb-5 text-right">
        {blockRef.doc === prepId ? (
          <Link className={LINK} to={{ hash: `#${blockRef.id}` }}>
            На этой странице ↑
          </Link>
        ) : (
          <Link className={LINK} to={paths.lecture(course, blockRef.doc, blockRef.id)}>
            {target === undefined ? "В конспекте" : `Лекция ${String(target.lecture)}`} →
          </Link>
        )}
      </div>
    </div>
  );
};
/** «Показать ответ»: the own answer, then each referenced block with a link to where it lives. */
export const TicketAnswer = ({ answer, course, prepId, refs, withProofs }: Props) => (
  <div className="mt-2">
    {answer !== "" && (
      <FragmentView course={course} docId={prepId} html={answer} lecture={undefined} />
    )}
    {refs.map((ref) => (
      <AnswerBlock
        blockRef={ref}
        course={course}
        key={ref.id}
        prepId={prepId}
        withProofs={withProofs}
      />
    ))}
  </div>
);
