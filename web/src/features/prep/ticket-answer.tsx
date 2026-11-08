import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";

import type { TicketRef } from "#web/domain/schemas.ts";

import { fragmentQuery, useLabelIndex } from "#web/api/queries.ts";
import { paths } from "#web/domain/paths.ts";
import { refsWithProof } from "#web/domain/tickets.ts";
import { type AnswerPart, extractAnswerPart } from "#web/shared/reader/extract-preview.ts";
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

const LINK = "text-footnote font-semibold text-def no-underline hover:underline";

/** Where a referenced block lives: this page (by anchor) or its lecture. */
const SourceLink = ({
  blockRef,
  course,
  lecture,
  name,
  prepId,
}: {
  readonly blockRef: TicketRef;
  readonly course: string;
  readonly lecture: number | undefined;
  readonly name: string;
  readonly prepId: string;
}) => {
  if (blockRef.doc === prepId) {
    return (
      <Link className={LINK} to={{ hash: `#${blockRef.id}` }}>
        {name} ↑
      </Link>
    );
  }
  return (
    <Link className={LINK} to={paths.lecture(course, blockRef.doc, blockRef.id)}>
      {name}
      {lecture === undefined ? "" : `, лекция ${String(lecture)}`} →
    </Link>
  );
};

/**
«Показать ответ»: one answer, written out. The own answer comes first, then the content of each
referenced block without its card — a statement with its proof, a problem's answer and solution — so
the parts read as one text; where the blocks live is only a row of links under it. A lecture proof is
left out where the page gives its own outline of it (`refsWithProof`).
*/
export const TicketAnswer = ({ answer, course, prepId, refs, withProofs }: Props) => {
  const labels = useLabelIndex()[course];
  const proved = refsWithProof(refs, prepId);
  const parts = useQueries({
    queries: refs.map((ref) => ({
      ...fragmentQuery(course, ref.doc),
      select: (fragment: string) =>
        extractAnswerPart(fragment, ref.id, withProofs && proved.has(ref.id)),
    })),
  });

  if (parts.some((part) => part.isPending)) {
    return <p className="mt-2 text-body text-muted">Загрузка…</p>;
  }
  const found = refs
    .map((ref, index) => ({ part: parts[index]?.data, ref }))
    .filter((item): item is { part: AnswerPart; ref: TicketRef } => item.part !== undefined);
  return (
    <div className="mt-2">
      {answer !== "" && (
        <FragmentView course={course} docId={prepId} html={answer} lecture={undefined} />
      )}
      {found.map(({ part, ref }) => (
        <FragmentView
          course={course}
          docId={ref.doc}
          html={part.html}
          key={ref.id}
          lecture={labels?.[ref.id]?.lecture}
          variant="notes"
        />
      ))}
      {found.length < refs.length && (
        <p className="text-body text-muted">Часть ответа не удалось загрузить.</p>
      )}
      {found.length > 0 && (
        <p className="mb-5 flex flex-wrap gap-x-4 gap-y-1">
          {found.map(({ part, ref }) => (
            <SourceLink
              blockRef={ref}
              course={course}
              key={ref.id}
              lecture={labels?.[ref.id]?.lecture}
              name={part.name}
              prepId={prepId}
            />
          ))}
        </p>
      )}
    </div>
  );
};
