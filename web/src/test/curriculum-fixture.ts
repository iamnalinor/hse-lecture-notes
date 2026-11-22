import { CurriculumSchema } from "#web/domain/curriculum.ts";

/** Three disciplines of the study plan: two categories, a seminar with variants and a practice without hours. */
export const SAMPLE = CurriculumSchema.parse({
  categories: [
    { id: "math", label: "Матеша", name: "Математика" },
    { id: "prog", label: "Прога", name: "Программирование" },
    { id: "empty", label: "Пусто", name: "Пусто" },
  ],
  disciplines: [
    {
      attestations: [2, 4],
      category: "math",
      credits: 8,
      hours: [28, 28, 44, 44],
      id: "algebra",
      name: "Алгебра",
      short: "Алгебра",
    },
    {
      attestations: [3],
      category: "prog",
      credits: 3,
      hours: [10, 14, 20, 0],
      id: "nis",
      name: "Научно-исследовательский семинар",
      short: "НИС",
      variants: 11,
    },
    {
      attestations: [],
      category: "prog",
      credits: 3,
      hours: [0, 0, 0, 0],
      id: "practice",
      name: "Учебная практика",
      no_module_hours: true,
      short: "Учебная практика",
    },
  ],
  module_spans: [{ from: "2026-11-05", module: 2, to: "2026-12-30" }],
  title: "План",
});
