import { MODULES } from "#web/domain/curriculum.ts";

import { GRID } from "./rows.tsx";

/*
Layers over the chart, on the same grid tracks as its rows. Painted under the sticky name column
(`z-10`); the column does not cover the 1 px row borders or the see-through group labels, so the
layers are also clipped at the column's right edge: `--plan-scroll` follows the horizontal scroll
(`StudyPlan`), `--plan-name` is the column's width.
*/
const CLIP = { clipPath: "inset(0 0 0 calc(var(--plan-name) + var(--plan-scroll, 0px)))" };

/** Thin lines where modules meet: the only vertical rules of the chart. Under the bars, over the wash. */
export const ModuleEdges = () => (
  <div
    aria-hidden="true"
    className={`${GRID} pointer-events-none absolute inset-0 z-0`}
    style={CLIP}
  >
    <div />
    {MODULES.map((module, index) => (
      <div className={index === 0 ? "" : "border-l border-rule"} key={module} />
    ))}
  </div>
);

/** Today's line: opaque, so the dashed copy over the group labels matches it exactly where both lie. */
const LINE = "color-mix(in srgb, var(--ink) 70%, var(--card))";
const DASHES = `repeating-linear-gradient(to bottom, ${LINE} 0 3px, transparent 3px 6px)`;

/**
Today: a thin line with an arrow at the top, at today's place inside the current module. Group labels
(`z-6`) cover the line; `ghost` draws it again over them, dashed, so it runs on under them in the same
colour and width. No transform on the line: a half-pixel shift would blur it into two lighter pixels.
*/
export const TodayMark = ({
  ghost = false,
  today,
}: {
  readonly ghost?: boolean;
  readonly today: undefined | { readonly fraction: number; readonly module: number };
}) =>
  today === undefined ? null : (
    <div
      aria-hidden="true"
      className={`${GRID} pointer-events-none absolute inset-0 ${ghost ? "z-7" : "z-5"}`}
      style={CLIP}
    >
      <div className="relative" style={{ gridColumn: today.module + 1, gridRow: 1 }}>
        <div
          className="absolute inset-y-0 w-px"
          data-today-mark={ghost ? undefined : ""}
          style={{ background: ghost ? DASHES : LINE, left: `${String(today.fraction * 100)}%` }}
        >
          {ghost ? null : (
            <span
              className="absolute -top-px left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
              style={{ borderTopColor: LINE }}
            />
          )}
        </div>
      </div>
    </div>
  );
