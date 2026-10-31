import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router";

import { notFound, useCourse } from "#web/api/use-course.ts";
import { resolveLecture } from "#web/domain/lectures.ts";
import { paths } from "#web/domain/paths.ts";
import { pdfUrl } from "#web/shared/ui/pdf-link.tsx";

/**
The theory page used to live at `/<course>/registry`. Saved links point there, often to a block
(`#reg-thm:…`), so the redirect keeps the hash and the query.
*/
export const LegacyTheoryRedirect = () => {
  const { course = "" } = useParams();
  const { hash, search } = useLocation();
  return <Navigate replace to={{ hash, pathname: paths.theory(course), search }} />;
};

const LECTURE_PDF = /^(?<course>[a-z]+)-(?<doc>\d{2}_[a-z0-9_]+)\.pdf$/u;

/**
PDFs are named by `week_id` (`/pdf/<course>-<week_id>.pdf`), and a renamed slug leaves the old file
missing: Pages answers with the shell, and this route sends the reader on to the PDF of the lecture
with the same number. A file that is missing under its current name is a real 404, not a loop.
*/
export const LegacyPdfRedirect = () => {
  const { file = "" } = useParams();
  const match = LECTURE_PDF.exec(file)?.groups;
  const { info, lectures } = useCourse(match?.["course"]);
  const resolved = resolveLecture(lectures, match?.["doc"] ?? "");
  const target = resolved === undefined || resolved.exact ? undefined : resolved.entry.weekId;
  useEffect(() => {
    if (target !== undefined) {
      globalThis.location.replace(pdfUrl(info.id, target));
    }
  }, [info.id, target]);
  return target === undefined ? notFound() : null;
};
