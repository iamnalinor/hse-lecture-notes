import { useLocation, useParams } from "react-router";

import { notFound, useCourse } from "#web/api/use-course.ts";
import { shortDate } from "#web/domain/dates.ts";
import { cheatsheetDocs, prepName } from "#web/domain/preps.ts";
import { CourseDocument } from "#web/shared/reader/course-document.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

/** Preparation for a test (`prep/<course>/krN.md`): topics, methods, problems with hidden answers. */
export const Component = () => {
  const { info, preps } = useCourse(useParams()["course"]);
  const id =
    useLocation()
      .pathname.split("/")
      .findLast((part) => part !== "") ?? "";
  const prep = preps.find((entry) => entry.id === id) ?? notFound();
  const name = prepName(prep.id);
  useDocumentTitle(prep.title); // same title as the page shell (`spa-fallback.ts`)

  return (
    <CourseDocument
      course={info.id}
      courseName={info.name}
      docId={prep.id}
      downloads={cheatsheetDocs(prep)}
      note={`${name} — ${shortDate(prep.date)}. Темы, методы, задачи с ответами`}
      pageName={`Подготовка к ${name}`}
      variant="prep"
    />
  );
};
