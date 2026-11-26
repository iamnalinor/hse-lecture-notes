import { useState } from "react";

import { parseDocContext } from "#web/domain/chat/model.ts";

type SourceVisit = {
  readonly origin: string;
  readonly destination: string;
  readonly owner: string;
  readonly returned: boolean;
};

/**
The visit that still holds. Opening the chat while reading the source (the header's «Чат») is the return to it;
closing the chat after the return, or leaving the source page, ends the visit.
*/
const currentVisit = (
  visit: null | SourceVisit,
  owner: string,
  isOpen: boolean,
): null | SourceVisit => {
  if (visit?.destination !== globalThis.location.pathname || visit.owner !== owner) {
    return null;
  }
  if (isOpen && !visit.returned) {
    return { ...visit, returned: true };
  }
  return visit.returned === isOpen ? visit : null;
};

export const useSourceReturn = (
  pathname: string,
  owner: string,
  { isOpen, general }: { readonly isOpen: boolean; readonly general: boolean },
) => {
  const [visit, setVisit] = useState<null | SourceVisit>(null);
  const current = currentVisit(visit, owner, isOpen);
  if (visit !== current) {
    setVisit(current);
  }
  const composerPath = current?.returned === true ? current.origin : pathname;
  const documentFor = (path: string) => parseDocContext(general ? "/" : path);
  return {
    docContext: documentFor(pathname),
    composerDoc: documentFor(composerPath),
    page: composerPath.split("/").filter(Boolean).join("/"),
    readingSource: current !== null && !current.returned,
    retainForSource: () => {
      setVisit({
        origin: current?.origin ?? pathname,
        destination: globalThis.location.pathname,
        owner,
        returned: false,
      });
    },
  };
};
