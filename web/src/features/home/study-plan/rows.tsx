import {
  barTitle,
  type CategoryGroup,
  creditsText,
  type Discipline,
  hourRuns,
  hoursPerWeek,
  intensity,
  MODULES,
} from "#web/domain/curriculum.ts";

import { barBorder, categoryColor, runBackground } from "./style.ts";

export type PlanScale = {
  readonly current: number | undefined;
  /** The highest load (hours per week, or hours without `weeks`): the top of the intensity scale. */
  readonly max: number;
  readonly maxTotal: number;
  readonly totals: readonly number[];
  /** Teaching weeks of modules 1–4, when the plan knows them. */
  readonly weeks: readonly number[] | undefined;
};

/** One name column plus four module columns; on a phone the name column is narrower and sticks to the left. */
export const GRID =
  "grid grid-cols-[8.75rem_repeat(4,minmax(5.5rem,1fr))] sm:grid-cols-[11.5rem_repeat(4,minmax(6rem,1fr))]";
const STICKY = "sticky left-0 z-10 bg-card";

export const HeaderRow = ({ current }: { readonly current: number | undefined }) => (
  <div className={`${GRID} border-b border-rule`}>
    <div className={`${STICKY} px-4 py-3 text-caption font-semibold text-muted`}>
      Контактные часы
    </div>
    {MODULES.map((module) => (
      <div
        className={`px-1.5 py-2.5 text-center text-footnote font-semibold ${module === current ? "bg-wash" : ""}`}
        key={module}
      >
        <span className={module === current ? "rounded-md bg-ink px-2 py-1 text-paper" : ""}>
          {module} модуль
        </span>
        <span className="mt-1 block text-caption font-normal text-muted">
          {module === current ? "идет сейчас" : "\u{A0}"}
        </span>
      </div>
    ))}
  </div>
);

/** A mini load chart: a column per module, as tall as the module's hours against the heaviest module. */
export const TotalRow = ({ scale }: { readonly scale: PlanScale }) => (
  <div className={`${GRID} border-b border-rule`}>
    <div className={`${STICKY} px-4 py-3`}>
      <div className="text-subhead font-semibold">Всего</div>
      <div className="text-caption text-muted">без физкультуры и английского</div>
    </div>
    {scale.totals.map((total, index) => (
      <div
        className={`flex items-end p-1.5 ${MODULES[index] === scale.current ? "bg-wash" : ""}`}
        key={MODULES[index]}
      >
        <div
          className="flex w-full items-center justify-center rounded-md border border-ink/25 bg-ink/15 text-footnote font-semibold tabular-nums"
          style={{ height: `${String(Math.max(28, Math.round((total / scale.maxTotal) * 64)))}px` }}
          title={`${String(total)} контактных часов в ${String(index + 1)} модуле`}
        >
          {total}
        </div>
      </div>
    ))}
  </div>
);

const GroupLabel = ({ group }: { readonly group: CategoryGroup }) => (
  <div className="col-span-5 border-b border-rule bg-paper/60 py-2">
    <span className="sticky left-0 flex w-fit items-center gap-2 px-4 text-caption font-semibold tracking-wide text-muted uppercase">
      <span
        className="size-2.5 rounded-xs"
        style={{ background: categoryColor(group.category.id) }}
      />
      {group.category.label}
    </span>
  </div>
);

/** Neighbouring modules of one discipline are one bar: flows across the column boundary, rounded at its ends only. */
const Run = (props: {
  readonly end: number;
  readonly row: Discipline;
  readonly scale: PlanScale;
  readonly start: number;
}) => {
  const { end, row, scale, start } = props;
  const strengths = row.hours
    .slice(start, end)
    .map((hours, offset) => intensity(hoursPerWeek(hours, start + offset, scale.weeks), scale.max));
  return (
    <div
      className="flex items-center p-1.5"
      style={{ gridColumn: `${String(start + 2)} / span ${String(end - start)}`, gridRow: 1 }}
    >
      <div className="relative h-8 w-full">
        <div
          aria-hidden="true"
          className="size-full rounded-md border"
          style={{
            background: runBackground(row.category, strengths),
            borderColor: barBorder(row.category, Math.max(...strengths)),
          }}
        />
        {/* Labels sit on the module columns, not on the bar: the bar is inset by the padding, its thirds are off-centre. */}
        <div
          className="absolute -inset-x-1.5 inset-y-0 grid text-footnote font-semibold text-ink tabular-nums"
          style={{ gridTemplateColumns: `repeat(${String(end - start)}, minmax(0, 1fr))` }}
        >
          {strengths.map((_, offset) => (
            <span
              className="flex items-center justify-center"
              key={MODULES[start + offset]}
              title={barTitle(row, start + offset, scale)}
            >
              {row.hours[start + offset]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

/** The full name is in the tooltip; the short one is the label, a long one wraps to two lines. */
const RowName = ({ row }: { readonly row: Discipline }) => (
  <div className={`${STICKY} flex flex-col justify-center px-3 py-2 sm:px-4`} title={row.name}>
    <div className="text-footnote/4 font-semibold sm:text-subhead/5">{row.short}</div>
    <div className="text-caption text-muted">{creditsText(row.credits)}</div>
  </div>
);

const DisciplineRow = ({ row, scale }: { readonly row: Discipline; readonly scale: PlanScale }) => (
  <div className={`${GRID} border-b border-rule last:border-0`}>
    <RowName row={row} />
    {MODULES.map((module, index) => (
      <div
        className={module === scale.current ? "bg-wash" : ""}
        key={module}
        style={{ gridColumn: index + 2, gridRow: 1 }}
      />
    ))}
    {hourRuns(row.hours).map((run) => (
      <Run end={run.end} key={run.start} row={row} scale={scale} start={run.start} />
    ))}
  </div>
);

export const GroupRows = ({
  group,
  scale,
}: {
  readonly group: CategoryGroup;
  readonly scale: PlanScale;
}) => (
  <>
    <div className={`${GRID} border-b border-rule`}>
      <GroupLabel group={group} />
    </div>
    {group.rows.map((row) => (
      <DisciplineRow key={row.id} row={row} scale={scale} />
    ))}
  </>
);
