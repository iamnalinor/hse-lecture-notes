/**
Course-wide documents, one per course: `theory/<course>.md` and `program/<course>.md` of the build
live at `/<course>/theory` and `/<course>/program`, their data in `data/<course>/<id>/`, their PDF is
`pdf/<course>-<id>.pdf`. The name is the crumb, the page title and the search label.
*/
export const COURSE_DOCS = {
  program: "План учебной дисциплины",
  theory: "Теория",
} as const;

export type CourseDocId = keyof typeof COURSE_DOCS;

export const isCourseDoc = (doc: string): doc is CourseDocId => Object.hasOwn(COURSE_DOCS, doc);

/** Title of the page and of its shell (`spa-fallback.ts`): «Алгебра: план учебной дисциплины». */
export const courseDocTitle = (courseName: string, doc: CourseDocId): string =>
  `${courseName}: ${COURSE_DOCS[doc].toLowerCase()}`;

/** Meta description of the page shell, after the course name. */
export const COURSE_DOC_DESCRIPTIONS: Readonly<Record<CourseDocId, string>> = {
  program: "формула оценки, контрольные и экзамены, темы курса",
  theory: "определения и теоремы курса",
};
