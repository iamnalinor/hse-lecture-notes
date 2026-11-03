/// <reference lib="webworker" />
/** Whether a newer deploy of the site is out, as the service worker sees it (`service-worker.ts`). */

declare const self: ServiceWorkerGlobalScope;

/** How long a navigation to a known page waits to learn whether a newer deploy is out. */
const UPDATE_CHECK_TIMEOUT_MS = 1500;

export const checkForUpdate = async (): Promise<void> => {
  try {
    await self.registration.update();
  } catch {
    // Offline: the page checks again later.
  }
};

const isNewerWorkerOut = (): boolean =>
  self.registration.installing !== null || self.registration.waiting !== null;

/**
Whether a newer deploy is out: a newer worker is installing or waiting already, or `sw.js` changed
(~3 KB, the check the page runs every minute). Offline or too slow → no.
*/
export const hasNewerDeploy = async (): Promise<boolean> => {
  if (isNewerWorkerOut()) {
    return true;
  }
  if (!navigator.onLine) {
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      self.registration.update(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(reject, UPDATE_CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
  return isNewerWorkerOut();
};
