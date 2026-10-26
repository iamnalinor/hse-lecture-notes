import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { TicketBank } from "#web/domain/schemas.ts";

import { ticketBankQuery } from "#web/api/queries.ts";
import { plural } from "#web/domain/text.ts";
import { drawTicket, type TicketPart } from "#web/domain/tickets.ts";

import { TicketQuestion } from "./ticket-question.tsx";

type Props = { readonly course: string; readonly prepId: string };

/** A drawn ticket; `serial` remounts the questions, so every new ticket starts with answers closed. */
type Drawn = { readonly parts: readonly TicketPart[]; readonly serial: number };

/** Read out to screen readers when a new ticket appears: «Билет 2: 9 вопросов». */
const announce = (drawn: Drawn): string => {
  const count = drawn.parts.flatMap((part) => part.questions).length;
  return `Билет ${String(drawn.serial)}: ${String(count)} ${plural(count, ["вопрос", "вопроса", "вопросов"])}`;
};

const Ticket = ({
  bank,
  course,
  drawn,
  prepId,
}: Props & { readonly bank: TicketBank; readonly drawn: Drawn }) => {
  /** Questions are numbered through the whole ticket: the first of a part follows the previous parts. */
  const first = (index: number): number =>
    drawn.parts.slice(0, index).flatMap((part) => part.questions).length + 1;
  return (
    <div className="mt-5">
      {drawn.parts.map((part, index) => (
        <section className="mt-4 first:mt-0" key={`${String(drawn.serial)}-${part.kind}`}>
          <h4 className="flex flex-wrap items-baseline gap-x-2.5 border-b border-rule pb-1.5 text-[15px] font-semibold">
            <span>{part.title}</span>
            {part.points !== "" && (
              <span className="text-sm font-normal text-muted">{part.points}</span>
            )}
          </h4>
          <ol className="m-0 list-none p-0">
            {part.questions.map((question, offset) => (
              <TicketQuestion
                course={course}
                key={`${String(drawn.serial)}-${question.id}`}
                number={first(index) + offset}
                prepId={prepId}
                proofs={part.proofs}
                question={question}
                topicTitle={bank.topics[question.topic]}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

/**
The ticket generator of a colloquium page: «Новый билет» draws a random ticket in the format of the
page's sample ticket from the bank (`prep/<course>/<prep>-bank.yaml`); each question opens its answer
in place. Nothing goes into the URL: a ticket lives until the next one.
*/
export const TicketGenerator = ({ course, prepId }: Props) => {
  const { data: bank, isError } = useQuery(ticketBankQuery(course, prepId));
  const [drawn, setDrawn] = useState<Drawn | undefined>(undefined);
  const size = bank?.questions.length ?? 0;

  return (
    <section
      aria-labelledby="ticket-generator-title"
      className="mt-10 rounded-lg border border-rule bg-card px-4 py-5 sm:px-6"
      id="ticket-generator"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="m-0 text-xl font-bold" id="ticket-generator-title">
            Генератор билетов
          </h3>
          <p className="mt-1 mb-0 text-sm text-muted">
            {isError
              ? "Не удалось загрузить банк вопросов."
              : `Случайный билет в том же формате из ${String(size)} ${plural(size, ["вопроса", "вопросов", "вопросов"])}; вопросы одного билета — из разных тем.`}
          </p>
        </div>
        <button
          className="min-h-11 cursor-pointer rounded-md bg-def px-5 py-2.5 font-semibold text-paper disabled:cursor-default disabled:opacity-50"
          disabled={bank === undefined}
          onClick={() => {
            if (bank !== undefined) {
              setDrawn((previous) => ({
                parts: drawTicket(bank),
                serial: (previous?.serial ?? 0) + 1,
              }));
            }
          }}
          type="button"
        >
          Новый билет
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {drawn === undefined ? "" : announce(drawn)}
      </p>
      {bank !== undefined && drawn !== undefined && (
        <Ticket bank={bank} course={course} drawn={drawn} prepId={prepId} />
      )}
    </section>
  );
};
