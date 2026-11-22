import { CurriculumSchema } from "#web/domain/curriculum.ts";

/** Disciplines of the study plan: two categories, a seminar with variants, neighbouring modules and a gap. */
export const SAMPLE = CurriculumSchema.parse({
  categories: [
    { id: "math", label: "Математика", name: "Математика" },
    { id: "prog", label: "Программирование", name: "Программирование" },
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
      attestations: [2],
      category: "prog",
      credits: 4,
      hours: [18, 18, 0, 0],
      id: "intro-se",
      name: "Введение в программную инженерию",
      short: "Введение в программную инженерию",
    },
    {
      attestations: [4],
      category: "prog",
      credits: 5,
      hours: [0, 0, 40, 40],
      id: "cpp",
      name: "Основы программирования на С++",
      short: "С++",
    },
    {
      attestations: [2, 4],
      category: "prog",
      credits: 1,
      hours: [9, 0, 9, 9],
      id: "gap",
      name: "Дисциплина с перерывом",
      short: "Перерыв",
    },
  ],
  excluded: [
    { credits: 3, in_plan_total: true, name: "Учебная практика" },
    { credits: 0, in_plan_total: true, name: "Физическая культура" },
    { credits: 8, in_plan_total: false, name: "Английский язык (факультатив)" },
  ],
  module_spans: [{ from: "2026-11-05", module: 2, to: "2026-12-30" }],
  title: "План",
});
