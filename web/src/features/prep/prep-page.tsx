import { useLocation, useParams } from "react-router";

import { notFound, useCourse } from "#web/api/use-course.ts";
import { cheatsheetDocs, prepContents, prepGoal, prepName, prepWhen } from "#web/domain/preps.ts";
import { CourseDocument } from "#web/shared/reader/course-document.tsx";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

import { TicketGenerator } from "./ticket-generator.tsx";

/**
Preparation for a test (`prep/<course>/krN.md`: topics, methods, problems with hidden answers) or a
colloquium (`colloqN.md`: definitions, theorems, proof outlines). A page with a ticket bank
(`colloqN-bank.yaml` → `bank` in the catalog) ends with the ticket generator, right after its sample ticket.
*/
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
      after={prep.bank === true ? <TicketGenerator course={info.id} prepId={prep.id} /> : undefined}
      course={info.id}
      courseName={info.name}
      docId={prep.id}
      downloads={cheatsheetDocs(prep)}
      note={`${name} — ${prepWhen(prep)}. ${prepContents(prep.id)}`}
      pageName={prepGoal(prep.id)}
      variant="prep"
    />
  );
};
