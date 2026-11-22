import { ChevronIcon } from "#web/shared/ui/icons.tsx";

type Props = {
  /** Topic ids of the bank in page order, with their section titles. */
  readonly names: Readonly<Record<string, string>>;
  readonly onChange: (chosen: ReadonlySet<string>) => void;
  readonly chosen: ReadonlySet<string>;
  readonly topics: readonly string[];
};

const CHIP =
  "min-h-10 cursor-pointer rounded-md border px-3 py-1.5 text-left text-subhead pointer-coarse:min-h-11";

const summary = (chosen: number, total: number): string =>
  chosen === total ? `Темы: все (${String(total)})` : `Темы: ${String(chosen)} из ${String(total)}`;

/**
Which topics a generated set may come from: all by default; a press turns one topic off or on.
Folded, it is one line; a student revising a single topic opens it, presses «Ничего» and picks.
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
        <span className="transition-transform group-open:rotate-90">
          <ChevronIcon size={14} />
        </span>
        {summary(chosen.size, topics.length)}
      </summary>
      <div aria-label="Темы вариантов" className="mt-2 flex flex-wrap gap-2" role="group">
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
              {names[topic] ?? topic}
            </button>
          );
        })}
        <button
          className={`${CHIP} border-transparent text-muted underline hover:text-ink`}
          onClick={() => {
            onChange(new Set(chosen.size === topics.length ? [] : topics));
          }}
          type="button"
        >
          {chosen.size === topics.length ? "Ничего" : "Все"}
        </button>
      </div>
    </details>
  );
};
