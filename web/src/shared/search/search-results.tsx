import { Link } from "react-router";

import { findCourse } from "#web/domain/courses.ts";
import { isPrepId, prepGoal } from "#web/domain/preps.ts";
import { hitPath, type SearchHit, type SnippetPart } from "#web/domain/search.ts";
import { TexMath } from "#web/shared/reader/tex-math.tsx";
import { TexText } from "#web/shared/reader/tex-text.tsx";

type Props = {
  readonly active: number;
  readonly hits: readonly SearchHit[];
  readonly onHover: (index: number) => void;
  readonly onPick: () => void;
};

const Part = ({ part }: { readonly part: SnippetPart }) => {
  if (part.kind === "math") {
    return <TexMath display={false} tex={part.value} />;
  }
  return part.kind === "mark" ? (
    <mark className="rounded-sm bg-def-soft px-px text-ink">{part.value}</mark>
  ) : (
    <>{part.value}</>
  );
};

const Snippet = ({ parts }: { readonly parts: readonly SnippetPart[] }) =>
  parts.map((part, index) => (
    // eslint-disable-next-line @eslint-react/no-array-index-key -- parts of a fixed string, never reordered
    <Part key={index} part={part} />
  ));

const placeOf = (hit: SearchHit): string => {
  const course = findCourse(hit.course)?.short ?? hit.course;
  if (hit.doc === "theory") {
    return `${course} · Теория`;
  }
  return isPrepId(hit.doc)
    ? `${course} · ${prepGoal(hit.doc)}`
    : `${course} · Лекция ${String(hit.lecture)}`;
};

export const resultId = (index: number): string => `search-hit-${String(index)}`;

export const SearchResults = ({ active, hits, onHover, onPick }: Props) => (
  <ul className="max-h-[60vh] overflow-y-auto p-2" id="search-results" role="listbox">
    {hits.map((hit, index) => (
      <li
        aria-selected={index === active}
        className="rounded-lg aria-selected:bg-wash"
        id={resultId(index)}
        key={`${hit.course}/${hit.doc}#${hit.anchor}`}
        role="option"
      >
        <Link
          className="block px-3 py-2.5 text-ink no-underline"
          onClick={onPick}
          onMouseMove={() => {
            onHover(index);
          }}
          tabIndex={-1}
          to={hitPath(hit)}
        >
          <small className="block text-xs text-muted">{placeOf(hit)}</small>
          <span className="block text-[15px] font-semibold">
            <TexText text={hit.heading} />
          </span>
          {hit.snippet.length > 0 && (
            <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-muted">
              <Snippet parts={hit.snippet} />
            </span>
          )}
        </Link>
      </li>
    ))}
  </ul>
);
