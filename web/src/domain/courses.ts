export type CourseId = "algebra" | "calculus" | "discrete";

export type CourseInfo = {
  readonly id: CourseId;
  readonly name: string;
  readonly short: string;
  readonly lecturer: string;
  /** The lecturer's profile on hse.ru. */
  readonly lecturerUrl: string;
  readonly weekday: string;
  /** «Лекции по средам» */
  readonly weekdayDative: string;
  /** TeX shown in the corner of the course card. */
  readonly symbol: string;
  readonly summary: string;
};

export const COURSES: readonly CourseInfo[] = [
  {
    id: "algebra",
    lecturer: "Михайлец Е. В.",
    lecturerUrl: "https://www.hse.ru/org/persons/229698931",
    name: "Алгебра",
    short: "Алгебра",
    summary:
      "Матрицы, метод Гаусса, определители, ранг. Определения и теоремы пронумерованы сквозь лекцию — «теорема 4.3» ведёт ровно в одно место.",
    symbol: String.raw`\det A`,
    weekday: "Среда",
    weekdayDative: "средам",
  },
  {
    id: "calculus",
    lecturer: "Бельдиев И. С.",
    lecturerUrl: "https://www.hse.ru/org/persons/225516943",
    name: "Математический анализ",
    short: "Матан",
    summary:
      "Логика и индукция, последовательности, пределы, точные грани, подпоследовательности и критерий Коши.",
    symbol: String.raw`\lim a_n`,
    weekday: "Пятница",
    weekdayDative: "пятницам",
  },
  {
    id: "discrete",
    lecturer: "Дашков Е. В.",
    lecturerUrl: "https://www.hse.ru/org/persons/104695093",
    name: "Дискретная математика",
    short: "Дискра",
    summary:
      "Высказывания и предикаты, множества, индукция на натуральных, делимость. Много ссылок между лекциями.",
    symbol: String.raw`a \mid b`,
    weekday: "Пятница",
    weekdayDative: "пятницам",
  },
];

export const findCourse = (id: string | undefined): CourseInfo | undefined =>
  COURSES.find((course) => course.id === id);
