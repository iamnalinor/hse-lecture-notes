import type { OfflineDocKind } from "./offline.ts";

import { isCourseDoc } from "./course-docs.ts";
import { isPrepId } from "./preps.ts";

/**
The kind of an offline document by its directory in `data/<course>/` (`scripts/build-sw.ts`):
`glossary`, a prep page (`kr1`, `colloq1`), a course document (`theory`, `program`), else a lecture.
Kept out of `offline.ts`, which the service worker bundles.
*/
export const offlineDocKind = (doc: string): OfflineDocKind => {
  if (doc === "glossary") {
    return "glossary";
  }
  if (isPrepId(doc)) {
    return "prep";
  }
  return isCourseDoc(doc) ? doc : "notes";
};
