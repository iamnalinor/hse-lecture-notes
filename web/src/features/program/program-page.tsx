import { useParams } from "react-router";

import { notFound, useCourse } from "#web/api/use-course.ts";
import { COURSE_DOCS, courseDocTitle } from "#web/domain/course-docs.ts";
import { CourseDocument } from "#web/shared/reader/course-document.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

/**
«Программа и оценивание» (`program/<course>.md`): the grade formula of each semester, the control
elements, retakes and the course topics, from the official programme of the course. A course
without the page is a 404, not an empty document.
*/
export const Component = () => {
  const { hasProgram, info } = useCourse(useParams()["course"]);
  useDocumentTitle(courseDocTitle(info.name, "program")); // same title as the page shell
  if (!hasProgram) {
    notFound();
  }

  return (
    <CourseDocument
      course={info.id}
      courseName={info.name}
      docId="program"
      note="Формула оценки, контрольные и экзамены, пересдачи, темы курса — по программе дисциплины"
      pageName={COURSE_DOCS.program}
      variant="program"
    />
  );
};
