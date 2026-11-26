import { useState } from "react";

import { parseDocContext } from "#web/domain/chat/model.ts";

export const useSourceReturn = (
  pathname: string,
  owner: string,
  { isOpen, general }: { readonly isOpen: boolean; readonly general: boolean },
) => {
  type SourceVisit = {
    readonly origin: string;
    readonly destination: string;
    readonly owner: string;
    readonly returned: boolean;
  };
  const [visit, setVisit] = useState<null | SourceVisit>(null);
  const current =
    visit?.destination === globalThis.location.pathname &&
    visit.owner === owner &&
    visit.returned === isOpen
      ? visit
      : null;
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
    returnFromSource: () => {
      if (current !== null) {
        setVisit({ ...current, returned: true });
      }
    },
  };
};
