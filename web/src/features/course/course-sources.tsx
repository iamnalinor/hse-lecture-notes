import type { CourseId } from "#web/domain/courses.ts";

import { type Source, SOURCES } from "#web/domain/sources.ts";

const LINK =
  "font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink";

/** What the notes of the course were written from: one block for the whole course, not per note. */
export const CourseSources = ({ course }: { readonly course: CourseId }) => (
  <section aria-labelledby="sources" className="border-t border-rule py-9 pb-20">
    <h2
      className="mb-3.5 text-[13px] font-semibold tracking-[0.16em] text-muted uppercase"
      id="sources"
    >
      Источники
    </h2>
    <p className="mb-4 max-w-160 text-[15px]/relaxed text-ink/80">
      Конспекты написаны по лекциям и материалам курса, часть задач и примеров взята из них.
    </p>
    <ul className="flex max-w-200 flex-col gap-2 text-[15px]/snug">
      {SOURCES[course].map((source) => (
        <li key={source.title}>
          <SourceLine source={source} />
        </li>
      ))}
    </ul>
  </section>
);

/** «Автор, Название — для чего», the title linked when the source is public. */
function SourceLine({ source }: { readonly source: Source }) {
  const title =
    source.url === undefined ? (
      <span className="font-semibold text-ink">{source.title}</span>
    ) : (
      <a className={LINK} href={source.url} rel="noreferrer" target="_blank">
        {source.title}
      </a>
    );
  return (
    <>
      {source.author !== undefined && <span className="text-ink">{source.author}, </span>}
      {title}
      {source.note !== undefined && <span className="text-muted"> — {source.note}</span>}
    </>
  );
}
