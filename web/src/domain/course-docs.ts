/**
Course-wide documents, one per course: `theory/<course>.md` and `program/<course>.md` of the build
live at `/<course>/theory` and `/<course>/program`, their data in `data/<course>/<id>/`, their PDF is
`pdf/<course>-<id>.pdf`. The name is the crumb, the page title and the search label.
*/
export const COURSE_DOCS = {
  program: "Программа и оценивание",
  theory: "Теория",
} as const;

export type CourseDocId = keyof typeof COURSE_DOCS;

export const isCourseDoc = (doc: string): doc is CourseDocId => Object.hasOwn(COURSE_DOCS, doc);
