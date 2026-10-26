import { Link } from "react-router";

import type { TicketQuestion as Question } from "#web/domain/schemas.ts";

import { FragmentView } from "#web/shared/reader/fragment-view.tsx";
import { Reveal } from "#web/shared/reader/reveal.tsx";
import { TexText } from "#web/shared/reader/tex-text.tsx";

import { TicketAnswer } from "./ticket-answer.tsx";

type Props = {
  readonly course: string;
  readonly number: number;
  readonly prepId: string;
  /** The question's ticket part wants proofs in the answer. */
  readonly proofs: boolean;
  readonly question: Question;
  /** Title of the page section the question belongs to (`sec:<prep>:<topic>`). */
  readonly topicTitle: string | undefined;
};

/** A numbered ticket question: its text, «Показать ответ» (answer in place) and a link to its section. */
export const TicketQuestion = ({ course, number, prepId, proofs, question, topicTitle }: Props) => (
  <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1 border-t border-rule py-4 first:border-t-0">
    <span className="pt-px text-lg font-bold text-muted tabular-nums">{number}.</span>
    <div>
      <div className="[&_.prose-notes>p]:my-0">
        <FragmentView course={course} docId={prepId} html={question.text} lecture={undefined} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <Reveal
          accessibleName={`Ответ на вопрос ${String(number)}`}
          closedLabel="Показать ответ"
          lazy
          openLabel="Ответ"
        >
          <TicketAnswer
            answer={question.answer}
            course={course}
            prepId={prepId}
            refs={question.refs}
            withProofs={proofs}
          />
        </Reveal>
        {topicTitle !== undefined && (
          <Link
            className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink"
            to={{ hash: `#sec:${prepId}:${question.topic}` }}
          >
            К разделу «<TexText text={topicTitle} />»
          </Link>
        )}
      </div>
    </div>
  </li>
);
