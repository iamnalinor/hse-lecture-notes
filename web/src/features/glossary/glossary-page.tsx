import { useState } from "react";
import { Link, useParams } from "react-router";

import { useGlossary } from "#web/api/queries.ts";
import { useCourse } from "#web/api/use-course.ts";
import { groupGlossary, isGlossaryMatch } from "#web/domain/glossary.ts";
import { paths } from "#web/domain/paths.ts";
import { plural } from "#web/domain/text.ts";
import { FragmentView } from "#web/shared/reader/fragment-view.tsx";
import { useScrollToHash } from "#web/shared/reader/use-scroll-to-hash.ts";
import { DocPage } from "#web/shared/ui/doc-page.tsx";
import { DocToc } from "#web/shared/ui/doc-toc.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

const anchor = (lecture: number): string => `lecture-${String(lecture)}`;

export const Component = () => {
  const { info, lectures } = useCourse(useParams()["course"]);
  const entries = useGlossary(info.id);
  const [query, setQuery] = useState("");
  useDocumentTitle(`${info.name}: глоссарий`);
  useScrollToHash();

  const groups = groupGlossary(
    entries.filter((entry) => isGlossaryMatch(entry, query)),
    lectures,
  );

  return (
    <DocPage
      aside={
        <DocToc
          caption="Лекции"
          toc={groups.map((group) => ({
            id: anchor(group.lecture),
            level: 1,
            text: `${String(group.lecture)}. ${group.title}`,
          }))}
        />
      }
      course={info.id}
      courseName={info.name}
      note={`${String(entries.length)} ${plural(entries.length, ["термин", "термина", "терминов"])} из конспектов лекций`}
      pageName="Глоссарий"
      wide
    >
      <input
        aria-label="Найти термин"
        className="mt-6 w-full rounded-lg border border-rule bg-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="Найти термин…"
        type="search"
        value={query}
      />
      {groups.length === 0 && <p className="mt-8 text-muted">Ничего не нашлось.</p>}
      {groups.map((group) => (
        <section className="scroll-mt-6" id={anchor(group.lecture)} key={group.lecture}>
          <h2 className="mt-10 mb-1 flex items-baseline gap-3 border-b border-rule pb-2 text-lg font-bold">
            <Link className="text-ink no-underline" to={paths.lecture(info.id, group.weekId)}>
              Лекция {group.lecture}
            </Link>
            <span className="text-[15px] font-normal text-muted">{group.title}</span>
          </h2>
          <div className="grid gap-x-10 xl:grid-cols-2">
            {group.entries.map((entry) => (
              <div className="mt-4 [&_.prose-notes]:text-[16.5px]" key={entry.term}>
                <div className="font-semibold [&_.prose-notes]:font-semibold">
                  <FragmentView
                    course={info.id}
                    docId={entry.weekId}
                    html={entry.termHtml}
                    lecture={entry.lecture}
                  />
                </div>
                <FragmentView
                  course={info.id}
                  docId={entry.weekId}
                  html={entry.defHtml}
                  lecture={entry.lecture}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </DocPage>
  );
};
