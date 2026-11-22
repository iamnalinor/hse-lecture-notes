import { TexText } from "#web/shared/reader/tex-text.tsx";
import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  /** Topics a set can come from, in page order. */
  readonly topics: readonly string[];
  /** Section titles by topic id (may hold `$…$`). */
  readonly names: Readonly<Record<string, string>>;
  readonly chosen: ReadonlySet<string>;
  readonly onChange: (chosen: ReadonlySet<string>) => void;
};

const CHIP =
  "min-h-10 cursor-pointer rounded-md border px-3 py-1.5 text-left text-subhead pointer-coarse:min-h-11";
const BULK =
  "min-h-10 cursor-pointer rounded-md px-2 text-subhead text-muted underline hover:text-ink disabled:cursor-default disabled:no-underline disabled:opacity-50 pointer-coarse:min-h-11";

const summary = (chosen: number, total: number): string =>
  chosen === total ? `Темы: все (${String(total)})` : `Темы: ${String(chosen)} из ${String(total)}`;

/**
Which topics a generated set may come from: all by default; a press turns one topic off or on (a
turned-off chip is also struck through, not only paler). Folded, it is one line; a student revising
a single topic opens it, presses «Ничего» and picks the topic.
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
    <details className="group mt-4">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-subhead text-muted hover:text-ink pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        {summary(chosen.size, topics.length)}
        <span className="transition-transform duration-200 group-open:rotate-90">
          <ChevronIcon size={14} />
        </span>
      </summary>
      <div aria-label="Темы для генерации" className="mt-2 flex flex-wrap gap-2" role="group">
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
        <button
          className={BULK}
          disabled={chosen.size === topics.length}
          onClick={() => {
            onChange(new Set(topics));
          }}
          type="button"
        >
          Все
        </button>
        <button
          className={BULK}
          disabled={chosen.size === 0}
          onClick={() => {
            onChange(new Set());
          }}
          type="button"
        >
          Ничего
        </button>
      </div>
    </details>
  );
};
