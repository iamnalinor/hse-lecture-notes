import { z } from "zod";

import { plural } from "./text.ts";

/** The first-year study plan (`program/curriculum-2026-y1.yaml` → `curriculum.json`): contact hours per module. */

export const MODULES: readonly number[] = [1, 2, 3, 4];

const HoursSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const CategorySchema = z.object({ id: z.string(), label: z.string(), name: z.string() });
export type Category = z.infer<typeof CategorySchema>;

const DisciplineSchema = z.object({
  attestations: z.array(z.number()),
  category: z.string(),
  credits: z.number(),
  /** Contact hours in modules 1–4. */
  hours: HoursSchema,
  id: z.string(),
  name: z.string(),
  short: z.string(),
  /** A seminar to choose from `variants` options (НИС). */
  variants: z.number().optional(),
});
export type Discipline = z.infer<typeof DisciplineSchema>;

const ExcludedSchema = z
  .object({ credits: z.number(), in_plan_total: z.boolean(), name: z.string() })
  .transform(({ in_plan_total: inPlanTotal, ...rest }) => ({ ...rest, inPlanTotal }));

/**
`from`…`to`: the module with its session (the current-module highlight); `study_to`: the last teaching day;
`weeks`: teaching days (`from`…`study_to` without the breaks) / 7, to 0.1 — the module's length for hours per week.
*/
const ModuleSpanSchema = z.object({
  from: z.string(),
  module: z.number(),
  study_to: z.string(),
  to: z.string(),
  weeks: z.number().positive(),
});

export const CurriculumSchema = z
  .object({
    categories: z.array(CategorySchema),
    disciplines: z.array(DisciplineSchema),
    /** Rows of the plan left off the chart; `in_plan_total`: counted in the plan's 60 credits (English is not). */
    excluded: z.array(ExcludedSchema).default([]),
    module_spans: z.array(ModuleSpanSchema),
    title: z.string(),
  })
  .transform(({ module_spans: moduleSpans, ...rest }) => ({ ...rest, moduleSpans }));
export type Curriculum = z.infer<typeof CurriculumSchema>;

export type CategoryGroup = { readonly category: Category; readonly rows: readonly Discipline[] };

const firstModule = (row: Discipline): number => row.hours.findIndex((hours) => hours > 0);
const lastModule = (row: Discipline): number => row.hours.findLastIndex((hours) => hours > 0);
const totalHours = (row: Discipline): number => row.hours.reduce((sum, hours) => sum + hours, 0);

/** Gantt order inside a category: earlier start, then earlier end, then more hours, then name. */
const bySpan = (a: Discipline, b: Discipline): number => {
  const keys = [
    firstModule(a) - firstModule(b),
    lastModule(a) - lastModule(b),
    totalHours(b) - totalHours(a),
  ];
  return keys.find((key) => key !== 0) ?? a.name.localeCompare(b.name, "ru");
};

/** Disciplines by category (in the order of the categories), each sorted by its time span; an empty category is dropped. */
export const groupByCategory = (curriculum: Curriculum): readonly CategoryGroup[] =>
  curriculum.categories
    .map((category) => ({
      category,
      rows: curriculum.disciplines.filter((row) => row.category === category.id).toSorted(bySpan),
    }))
    .filter((group) => group.rows.length > 0);

/** Contact hours of all the disciplines in each module. */
export const moduleTotals = (rows: readonly Discipline[]): readonly number[] =>
  MODULES.map((_, index) => rows.reduce((sum, row) => sum + (row.hours[index] ?? 0), 0));

/** Teaching weeks of modules 1–4; `undefined` unless the plan knows all four (then the scale falls back to hours). */
export const moduleWeeks = (curriculum: Curriculum): readonly number[] | undefined => {
  const weeks = MODULES.map(
    (module) => curriculum.moduleSpans.find((span) => span.module === module)?.weeks,
  );
  return weeks.every((value) => value !== undefined) ? weeks : undefined;
};

/** Contact hours per teaching week of a module; plain hours when the module lengths are unknown. */
export const hoursPerWeek = (
  hours: number,
  index: number,
  weeks: readonly number[] | undefined,
): number => hours / (weeks?.[index] ?? 1);

/** The highest load of one discipline in one module (hours per week): the top of the single intensity scale. */
export const maxLoad = (
  rows: readonly Discipline[],
  weeks: readonly number[] | undefined,
): number =>
  Math.max(
    0,
    ...rows.flatMap((row) => row.hours.map((hours, index) => hoursPerWeek(hours, index, weeks))),
  );

/** «3,5» — hours per week with a decimal comma, to 0.1. */
export const loadText = (load: number): string =>
  (Math.round(load * 10) / 10).toFixed(1).replace(".", ",");

/** Whole percent of the module's hours, 0 for an empty module. */
export const hoursShare = (hours: number, total: number): number =>
  total <= 0 ? 0 : Math.round((hours / total) * 100);

const MIN_INTENSITY = 0.3;

/**
Bar strength 0.3…1 by load (hours per week, so modules of different length compare fairly) on the scale
of the whole chart; no load → 0 (no bar).
*/
export const intensity = (load: number, max: number): number =>
  max <= 0 || load <= 0 ? 0 : MIN_INTENSITY + (1 - MIN_INTENSITY) * Math.min(1, load / max);

/** The module that is under way today, if the repository knows its dates (`module_spans`). */
export const currentModule = (curriculum: Curriculum, today: string): number | undefined =>
  curriculum.moduleSpans.find((span) => span.from <= today && today <= span.to)?.module;

const listModules = (modules: readonly number[]): string => {
  const last = modules.at(-1);
  return last === undefined || modules.length < 2
    ? modules.join("")
    : `${modules.slice(0, -1).join(", ")} и ${String(last)}`;
};

/** «аттестация в 2 и 4 модулях»; empty when the discipline has none. */
export const attestationText = (modules: readonly number[]): string => {
  if (modules.length === 0) {
    return "";
  }
  return `аттестация в ${listModules(modules)} ${modules.length === 1 ? "модуле" : "модулях"}`;
};

/** Runs of consecutive modules with hours: `[28, 28, 0, 40]` → `[{start: 0, end: 2}, {start: 3, end: 4}]` (`end` exclusive). */
export const hourRuns = (
  hours: readonly number[],
): readonly { readonly end: number; readonly start: number }[] =>
  hours
    .entries()
    .filter(([index, value]) => value > 0 && (hours[index - 1] ?? 0) <= 0)
    .map(([start]) => {
      const gap = hours.slice(start).findIndex((value) => value <= 0);
      return { end: gap === -1 ? hours.length : start + gap, start };
    })
    .toArray();

export type CreditSums = {
  readonly shown: number;
  readonly withEnglish: number;
  readonly withHidden: number;
};

const sum = (rows: readonly { readonly credits: number }[]): number =>
  rows.reduce((total, row) => total + row.credits, 0);

/** Credits for the year: of the shown disciplines, with the hidden rows of the plan's 60, with the facultative English too. */
export const creditSums = (curriculum: Curriculum): CreditSums => {
  const shown = sum(curriculum.disciplines);
  const withHidden = shown + sum(curriculum.excluded.filter((row) => row.inPlanTotal));
  return {
    shown,
    withEnglish: withHidden + sum(curriculum.excluded.filter((row) => !row.inPlanTotal)),
    withHidden,
  };
};

export const creditsText = (credits: number): string =>
  `${String(credits)} ${plural(credits, ["кредит", "кредита", "кредитов"])}`;

/** «28 ч · 3,5 ч/нед — 14% часов модуля · 8 кредитов за год» (the bar hint; the share does not depend on the module's length). */
export const barTitle = (
  row: Discipline,
  index: number,
  scale: { readonly totals: readonly number[]; readonly weeks: readonly number[] | undefined },
): string => {
  const hours = row.hours[index] ?? 0;
  const { totals, weeks } = scale;
  const total = totals[index] ?? 0;
  const rate = weeks === undefined ? "" : ` · ${loadText(hoursPerWeek(hours, index, weeks))} ч/нед`;
  const parts = [
    `${String(hours)} ч${rate} — ${String(hoursShare(hours, total))}% часов модуля`,
    `${creditsText(row.credits)} за год`,
    row.variants === undefined
      ? ""
      : `${row.name}: нужно выбрать один из ${String(row.variants)} семинаров`,
  ];
  return parts.filter((part) => part !== "").join(" · ");
};
