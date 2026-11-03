import { useEffect } from "react";
import { createPath, NavigationType, useBlocker } from "react-router";

import { isOtherPage } from "#web/domain/paths.ts";

import { didOpenUpdated, useHasUpdate } from "./sw-registration.ts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/u, "");

/**
While a new version is out and the network is up, a link to another page opens it as a full page
load of the new version instead of a route change in the old code: the page changes anyway, so the
update costs nothing. Back and forward (`POP`), anchors on the same page and links followed
offline stay in the old code; the banner still offers «Обновить».
*/
export const useUpdateOnNavigation = (): void => {
  const hasUpdate = useHasUpdate();
  const blocker = useBlocker(
    ({ currentLocation, historyAction, nextLocation }) =>
      hasUpdate &&
      navigator.onLine &&
      historyAction !== NavigationType.Pop &&
      isOtherPage(currentLocation.pathname, nextLocation.pathname),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    void (async () => {
      if (!(await didOpenUpdated(`${BASE}${createPath(blocker.location)}`))) {
        blocker.proceed();
      }
    })();
  }, [blocker]);
};
