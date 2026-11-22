import { z } from "zod";

import { plural } from "./text.ts";

/** The first-year study plan (`program/curriculum-2026-y1.yaml` → `curriculum.json`): contact hours per module. */

export const MODULES: readonly number[] = [1, 2, 3, 4];

const HoursSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const CategorySchema = z.object({ id: z.string(), label: z.string(), name: z.string() });
export type Category = z.infer<typeof CategorySchema>;

const DisciplineSchema = z
  .object({
    attestations: z.array(z.number()),
    category: z.string(),
    credits: z.number(),
    /** Contact hours in modules 1–4. */
    hours: HoursSchema,
    id: z.string(),
    name: z.string(),
    /** Fixed period without module hours («Ф»): drawn as a note, not as bars. */
    no_module_hours: z.boolean().default(false),
    short: z.string(),
    /** A seminar to choose from `variants` options (НИС). */
    variants: z.number().optional(),
  })
  .transform(({ no_module_hours: noModuleHours, ...rest }) => ({ ...rest, noModuleHours }));
export type Discipline = z.infer<typeof DisciplineSchema>;

const ModuleSpanSchema = z.object({ from: z.string(), module: z.number(), to: z.string() });

export const CurriculumSchema = z
  .object({
    categories: z.array(CategorySchema),
    disciplines: z.array(DisciplineSchema),
    module_spans: z.array(ModuleSpanSchema),
    title: z.string(),
  })
  .transform(({ module_spans: moduleSpans, ...rest }) => ({ ...rest, moduleSpans }));
export type Curriculum = z.infer<typeof CurriculumSchema>;

export type CategoryGroup = { readonly category: Category; readonly rows: readonly Discipline[] };

/** Disciplines by category, in the order of the categories; an empty category is dropped. */
export const groupByCategory = (curriculum: Curriculum): readonly CategoryGroup[] =>
  curriculum.categories
    .map((category) => ({
      category,
      rows: curriculum.disciplines.filter((row) => row.category === category.id),
    }))
    .filter((group) => group.rows.length > 0);

/** Contact hours of all the disciplines in each module. */
export const moduleTotals = (rows: readonly Discipline[]): readonly number[] =>
  MODULES.map((_, index) => rows.reduce((sum, row) => sum + (row.hours[index] ?? 0), 0));

/** The most hours one discipline has in one module: the top of the single intensity scale. */
export const maxHours = (rows: readonly Discipline[]): number =>
  Math.max(0, ...rows.flatMap((row) => row.hours));

/** Whole percent of the module's hours, 0 for an empty module. */
export const hoursShare = (hours: number, total: number): number =>
  total <= 0 ? 0 : Math.round((hours / total) * 100);

const MIN_INTENSITY = 0.3;

/** Bar strength 0.3…1 by absolute hours on the scale of the whole chart; 0 hours → 0 (no bar). */
export const intensity = (hours: number, max: number): number =>
  max <= 0 || hours <= 0 ? 0 : MIN_INTENSITY + (1 - MIN_INTENSITY) * Math.min(1, hours / max);

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

export const creditsText = (credits: number): string =>
  `${String(credits)} ${plural(credits, ["кредит", "кредита", "кредитов"])}`;

/** «28 ч — 14% часов модуля · 8 кредитов за год · аттестация в 2 и 4 модулях» (the bar hint). */
export const barTitle = (row: Discipline, index: number, total: number): string => {
  const hours = row.hours[index] ?? 0;
  const parts = [
    `${String(hours)} ч — ${String(hoursShare(hours, total))}% часов модуля`,
    `${creditsText(row.credits)} за год`,
    attestationText(row.attestations),
    row.variants === undefined
      ? ""
      : `${row.name}: нужно выбрать один из ${String(row.variants)} семинаров`,
  ];
  return parts.filter((part) => part !== "").join(" · ");
};
