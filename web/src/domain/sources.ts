import type { CourseId } from "./courses.ts";

/**
A material the notes of a course were written from, listed on the course page. The full list with
what each one was used for is `context/sources.md`; a source added there goes here too, unless it
is private (a closed channel, a work sent to the owner) — then without a link.
*/
export type Source = {
  readonly author?: string;
  /** What was taken from it, in a few words. */
  readonly note?: string;
  readonly title: string;
  readonly url?: string;
};

const PAST_YEAR = "https://github.com/vasyukov1/HSE-FCS-SE-1-year";

export const SOURCES: Readonly<Record<CourseId, readonly Source[]>> = {
  algebra: [
    {
      author: "Е. В. Михайлец",
      note: "записи на YouTube",
      title: "Лекции по алгебре, ПИ 2026/27",
      url: "https://www.youtube.com/playlist?list=PLaRUkmFktq1E",
    },
    {
      note: "темы лекций, типовые задачи, определения и вопросы к КР-1",
      title: "Канал курса",
      url: "https://t.me/alg_pi_26_27",
    },
    {
      note: "темы лекций 2024/25–2026/27",
      title: "Wiki курса",
      url: "https://wiki.cs.hse.ru/Алгебра_ПИ_2026-2027",
    },
    {
      title: "Программа дисциплины 2026/27",
      url: "https://www.hse.ru/ba/se/courses/1163594066.html",
    },
    {
      note: "конспект лекций, задачи к КР-1, вопросы к коллоквиуму",
      title: "Материалы курса 2023/24 (репозиторий vasyukov1/HSE-FCS-SE-1-year)",
      url: PAST_YEAR,
    },
    { author: "И. В. Проскуряков", title: "Сборник задач по линейной алгебре" },
  ],
  calculus: [
    {
      author: "И. С. Бельдиев",
      note: "записи на YouTube",
      title: "Лекции по математическому анализу, ПИ 2026/27",
      url: "https://www.youtube.com/playlist?list=PLJlA4dg2M_qc",
    },
    {
      note: "задачи практики и самопроверки, подготовка к КР1",
      title: "Семинарские листки и демоверсия КР1 2026/27",
      url: "https://drive.google.com/drive/folders/1tbsAlQ9jFL4w7WTh7vY1r6hlBR52hn4y",
    },
    { title: "Wiki курса", url: "https://wiki.cs.hse.ru/Математический_анализ_26/27" },
    {
      title: "График курса 2026/27",
      url: "https://docs.google.com/spreadsheets/d/1fM1nTgaJxgM4roeqF3VLv9_5qhn5tGHn-wrTtyqoxvQ/edit",
    },
    {
      title: "Программа дисциплины 2026/27",
      url: "https://dp.hse.ru/#/summary?implementationId=16281525898",
    },
    { note: "канал курса", title: "Программа коллоквиума 1" },
    {
      note: "конспект лекций в TeX, программы коллоквиумов",
      title: "Матанализ ПИ 2023/24 (репозиторий i80287/Calculus-HSE-SE)",
      url: "https://github.com/i80287/Calculus-HSE-SE",
    },
    {
      note: "семинарские листки и квизы",
      title: "Материалы курса 2023/24 (репозиторий vasyukov1/HSE-FCS-SE-1-year)",
      url: PAST_YEAR,
    },
  ],
  discrete: [
    { author: "Е. В. Дашков", title: "Лекции по дискретной математике, ПИ 2026/27" },
    {
      author: "E. Dashkov",
      note: "конспект лекций курса: конспекты идут по его главам, часть примеров взята оттуда",
      title: "Elements of Discrete Mathematics",
      url: "https://drive.google.com/file/d/1YFYHP3oHlv6zPI6d0k96Intjyu0qZpus/view",
    },
    {
      note: "перевод 2023 года, главы 1–7 и 9",
      title: "Elements of Discrete Mathematics, русский перевод",
      url: "https://drive.google.com/file/d/19ofoTdWUNepPDDdRfV-FfTF_Ug71YYot/view",
    },
    {
      note: "задачи практики и самопроверки",
      title: "Домашние задания и семинарские листки 2026/27",
      url: "https://drive.google.com/drive/folders/1vJQkWLMxA-3_T9pb3EelOCd_3wsUvcXC",
    },
    { title: "Wiki курса", url: "https://wiki.cs.hse.ru/Дискретная_математика_26/27" },
    {
      title: "Программа дисциплины 2026/27",
      url: "https://www.hse.ru/ba/se/courses/1163594128.html",
    },
    {
      note: "конспекты лекций, контрольные работы",
      title: "Материалы курса 2023/24 (репозиторий vasyukov1/HSE-FCS-SE-1-year)",
      url: PAST_YEAR,
    },
    { note: "подготовка к КР-1", title: "КР-1 2025/26" },
  ],
};
