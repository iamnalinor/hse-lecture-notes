import type { ReactNode } from "react";

import {
  attestationText,
  barTitle,
  type CategoryGroup,
  creditsText,
  type Discipline,
  intensity,
  MODULES,
} from "#web/domain/curriculum.ts";

import { barBackground, barBorder, categoryColor } from "./study-plan-style.ts";

export type PlanScale = {
  readonly current: number | undefined;
  readonly max: number;
  readonly maxTotal: number;
  readonly totals: readonly number[];
};

/** One name column plus four module columns; on a phone the name column is narrower and sticks to the left. */
export const GRID =
  "grid grid-cols-[8.5rem_repeat(4,minmax(5.5rem,1fr))] sm:grid-cols-[11.5rem_repeat(4,minmax(6rem,1fr))]";
const STICKY = "sticky left-0 z-10 bg-card";

const Cell = ({
  children,
  isCurrent,
}: {
  readonly children?: ReactNode;
  readonly isCurrent: boolean;
}) => (
  <div className={`relative flex items-center p-1.5 ${isCurrent ? "bg-wash" : ""}`}>{children}</div>
);

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
          {module === current ? "идёт сейчас" : "\u{A0}"}
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
          className="flex w-full items-start justify-center rounded-md border border-ink/25 bg-ink/15 pt-1 text-footnote font-semibold tabular-nums"
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

const Bar = (props: {
  readonly index: number;
  readonly row: Discipline;
  readonly scale: PlanScale;
}) => {
  const { index, row, scale } = props;
  const hours = row.hours[index] ?? 0;
  const strength = intensity(hours, scale.max);
  return (
    <div
      className="relative flex h-8 w-full items-center justify-center rounded-md border text-footnote font-semibold text-ink tabular-nums"
      style={{
        background: barBackground(row.category, strength),
        borderColor: barBorder(row.category, strength),
      }}
      title={barTitle(row, index, scale.totals[index] ?? 0)}
    >
      {hours}
      {row.attestations.includes(index + 1) ? (
        <span
          className="absolute top-1/2 right-1.5 size-2 -translate-y-1/2 rounded-full bg-ink"
          title={attestationText([index + 1])}
        />
      ) : null}
    </div>
  );
};

const RowName = ({ row }: { readonly row: Discipline }) => (
  <div className={`${STICKY} px-4 py-2`} title={row.name}>
    <div className="text-subhead/5 font-semibold">{row.short}</div>
    <div className="text-caption text-muted">
      {creditsText(row.credits)}
      {row.variants === undefined ? "" : ` · один из ${String(row.variants)}`}
    </div>
  </div>
);

const NoHours = () => (
  <div className="col-span-4 flex items-center p-1.5">
    <div className="w-full rounded-md border border-dashed border-ink/30 px-3 py-1.5 text-center text-footnote text-muted">
      без часов по модулям · срок фиксированный
    </div>
  </div>
);

const DisciplineRow = ({ row, scale }: { readonly row: Discipline; readonly scale: PlanScale }) => (
  <div className={`${GRID} border-b border-rule last:border-0`}>
    <RowName row={row} />
    {row.noModuleHours ? (
      <NoHours />
    ) : (
      MODULES.map((module, index) => (
        <Cell isCurrent={module === scale.current} key={module}>
          {(row.hours[index] ?? 0) > 0 ? <Bar index={index} row={row} scale={scale} /> : null}
        </Cell>
      ))
    )}
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
