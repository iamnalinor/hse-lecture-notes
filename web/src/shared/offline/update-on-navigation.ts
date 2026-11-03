import { useEffect } from "react";
import { createPath, NavigationType, useBlocker } from "react-router";

import { openUpdated, useHasUpdate } from "./sw-registration.ts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/u, "");

/**
While a new version is out, a link to another page opens it as a full page load of the new version
instead of a route change in the old code: the page changes anyway, so the update costs nothing.
Back and forward (`POP`) and anchors on the same page stay in the old code; the banner still
offers «Обновить».
*/
export const useUpdateOnNavigation = (): void => {
  const hasUpdate = useHasUpdate();
  const blocker = useBlocker(
    ({ currentLocation, historyAction, nextLocation }) =>
      hasUpdate &&
      historyAction !== NavigationType.Pop &&
      nextLocation.pathname !== currentLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === "blocked") {
      openUpdated(`${BASE}${createPath(blocker.location)}`);
    }
  }, [blocker]);
};
