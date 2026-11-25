import type { CourseId } from "#web/domain/courses.ts";

import { type Source, SOURCES } from "#web/domain/sources.ts";

/** An underlined text link on the course page: the lecturer, the sources. */
export const TEXT_LINK =
  "font-semibold text-ink underline decoration-ink/30 underline-offset-2 [text-decoration-skip-ink:none] hover:decoration-ink";

/** What the notes of the course were written from: one block for the whole course, not per note. */
export const CourseSources = ({ course }: { readonly course: CourseId }) => (
  <section aria-labelledby="sources" className="border-t border-rule py-9 pb-20">
    <h2 className="mb-3 text-title3 font-semibold" id="sources">
      Источники
    </h2>
    <ul className="flex max-w-200 flex-col gap-2 text-subhead/snug">
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
      <a className={TEXT_LINK} href={source.url} rel="noreferrer" target="_blank">
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
