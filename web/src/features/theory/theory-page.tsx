import { useParams } from "react-router";

import { useCourse } from "#web/api/use-course.ts";
import { CourseDocument } from "#web/shared/reader/course-document.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

export const Component = () => {
  const { info } = useCourse(useParams()["course"]);
  useDocumentTitle(`${info.name}: теория`);

  return (
    <CourseDocument
      course={info.id}
      courseName={info.name}
      docId="theory"
      note="Все определения и теоремы курса с идеями доказательств"
      pageName="Теория"
      variant="theory"
    />
  );
};
