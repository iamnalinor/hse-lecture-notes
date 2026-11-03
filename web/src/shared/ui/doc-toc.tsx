import { useEffect, useRef } from "react";
import { Link } from "react-router";

import type { TocItem } from "#web/domain/schemas.ts";

import { useActiveSection } from "./use-active-section.ts";
import { useReadingProgress } from "./use-reading-progress.ts";

type Props = {
  /** Small caption above the list: «Лекция 4», «Теория». */
  readonly caption: string;
  /** Rough reading time of the whole document; without it there is no progress bar. */
  readonly minutes?: number;
  /** Called after a tap on an item: the folded phone version closes itself. */
  readonly onNavigate?: () => void;
  readonly toc: readonly TocItem[];
};

const MAX_LEVEL = 2;

/** Sections and subsections: deeper headings stay out of the table of contents. */
export const tocItems = (toc: readonly TocItem[]): readonly TocItem[] =>
  toc.filter((item) => item.level <= MAX_LEVEL);

/** From this width the table of contents is a sticky side column; below it, a sheet (`TocSheet`). */
export const WIDE_QUERY = "(min-width: 1100px)";

type State = {
  /** Id of the section being read (`useActiveSection`). */
  readonly active: string | undefined;
  /** Scroll position of the page, 0…1. */
  readonly progress: number;
};

/**
The side column: tracks the section being read itself. Only one table of contents per page may call
`useActiveSection` — the first one to see a jump pins its target, the others would miss it — so the
phone sheet renders `TocList` with its own state instead of mounting a second `DocToc`.
*/
export const DocToc = (props: Props) => {
  const active = useActiveSection(tocItems(props.toc).map((item) => item.id));
  const progress = useReadingProgress();
  return <TocList {...props} active={active} progress={progress} />;
};

export const TocList = ({ active, caption, minutes, onNavigate, progress, toc }: Props & State) => {
  const items = tocItems(toc);
  const percent = Math.round(progress * 100);
  const ref = useRef<HTMLElement>(null);

  // A long list (a test prep) scrolls in its column or sheet: keep the active item in view.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <nav aria-label="Оглавление" ref={ref}>
      <div className="mb-3 text-footnote font-semibold text-ink">{caption}</div>
      <ol className="m-0 list-none p-0 text-footnote/snug">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              aria-current={item.id === active ? "location" : undefined}
              className={`block border-l-2 border-rule py-1.5 text-muted no-underline aria-[current=location]:border-def aria-[current=location]:font-semibold aria-[current=location]:text-ink ${item.level === 1 ? "pl-3" : "pl-6 text-footnote"}`}
              onClick={onNavigate}
              to={{ hash: `#${item.id}` }}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ol>
      {minutes !== undefined && (
        <>
          <div className="my-4.5 h-px bg-rule" />
          <div className="text-footnote text-muted">
            Прочитано {percent}% · ~{Math.max(1, Math.ceil(minutes * (1 - progress)))} мин осталось
            <div className="mt-2 h-0.75 overflow-hidden rounded-xs bg-rule">
              <div className="h-full bg-def" style={{ width: `${String(percent)}%` }} />
            </div>
          </div>
        </>
      )}
    </nav>
  );
};
