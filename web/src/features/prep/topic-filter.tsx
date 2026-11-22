import { TexText } from "#web/shared/reader/tex-text.tsx";

type Props = {
  /** Topics a set can come from, in page order. */
  readonly topics: readonly string[];
  /** Section titles by topic id (may hold `$…$`). */
  readonly names: Readonly<Record<string, string>>;
  readonly chosen: ReadonlySet<string>;
  readonly onChange: (chosen: ReadonlySet<string>) => void;
};

const CHIP =
  "cursor-pointer rounded-full border px-2.5 py-0.5 text-left text-footnote pointer-coarse:py-1.5";
const BULK =
  "cursor-pointer px-2.5 py-0.5 text-footnote font-semibold text-ink hover:bg-wash disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent pointer-coarse:py-1.5";

const summary = (chosen: number, total: number): string =>
  chosen === total ? `все ${String(total)}` : `${String(chosen)} из ${String(total)}`;

type BulkProps = {
  readonly chosen: number;
  readonly topics: readonly string[];
  readonly onChange: (chosen: ReadonlySet<string>) => void;
};

/** «Выбрать все» / «Сбросить все» as one segmented control: two halves of a pill, the one that would change nothing greyed. */
const BulkButtons = ({ chosen, onChange, topics }: BulkProps) => (
  <span className="inline-flex divide-x divide-rule overflow-hidden rounded-full border border-rule bg-card">
    <button
      className={BULK}
      disabled={chosen === topics.length}
      onClick={() => {
        onChange(new Set(topics));
      }}
      type="button"
    >
      Выбрать все
    </button>
    <button
      className={BULK}
      disabled={chosen === 0}
      onClick={() => {
        onChange(new Set());
      }}
      type="button"
    >
      Сбросить все
    </button>
  </span>
);

/**
Which topics a generated set may come from: all by default; a press turns one topic off or on (a
turned-off chip is also struck through, not only paler). Always open and compact: a line with the
count and «Выбрать все / Сбросить все», then small chips.
*/
export const TopicFilter = ({ chosen, names, onChange, topics }: Props) => {
  const toggle = (topic: string): void => {
    const next = new Set(chosen);
    if (next.has(topic)) {
      next.delete(topic);
    } else {
      next.add(topic);
    }
    onChange(next);
  };
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <span className="text-footnote text-muted">
          Темы: {summary(chosen.size, topics.length)}
        </span>
        <BulkButtons chosen={chosen.size} onChange={onChange} topics={topics} />
      </div>
      <div aria-label="Темы для генерации" className="mt-2 flex flex-wrap gap-1.5" role="group">
        {topics.map((topic) => {
          const isOn = chosen.has(topic);
          return (
            <button
              aria-pressed={isOn}
              className={`${CHIP} ${isOn ? "border-ink/40 bg-wash text-ink" : "border-rule bg-card text-muted line-through decoration-muted/50"}`}
              key={topic}
              onClick={() => {
                toggle(topic);
              }}
              type="button"
            >
              <TexText text={names[topic] ?? topic} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
