import { useSyncExternalStore } from "react";

import { isOfflineSupported } from "#web/api/offline-cache.ts";

const UPDATE_CHECK_MS = 60_000;

/** `waiting`: a new worker installed and waiting — the site changed since this tab loaded. */
const store: { waiting: ServiceWorker | undefined } = { waiting: undefined };
const listeners = new Set<() => void>();

const setWaiting = (worker: ServiceWorker): void => {
  store.waiting = worker;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useHasUpdate = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => store.waiting !== undefined,
    () => false,
  );

const watchInstalling = (worker: ServiceWorker): void => {
  worker.addEventListener("statechange", () => {
    // Without a controller this is the first install, not an update.
    if (worker.state === "installed" && navigator.serviceWorker.controller !== null) {
      setWaiting(worker);
    }
  });
};

const watchForUpdates = (registration: ServiceWorkerRegistration): void => {
  const check = async (): Promise<void> => {
    try {
      await registration.update();
    } catch {
      // Offline: try again later.
    }
  };
  setInterval(() => void check(), UPDATE_CHECK_MS);
  globalThis.addEventListener("focus", () => void check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void check();
    }
  });
};

const unregisterAll = async (): Promise<void> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(async (registration) => await registration.unregister()));
};

/** Registers `sw.js` in production; in dev removes a worker left over from `vite preview`. */
export const registerServiceWorker = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  if (!isOfflineSupported()) {
    await unregisterAll();
    return;
  }
  const base = import.meta.env.BASE_URL;
  const registration = await navigator.serviceWorker.register(`${base}sw.js`, {
    scope: base,
    updateViaCache: "none",
  });
  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
    setWaiting(registration.waiting);
  }
  registration.addEventListener("updatefound", () => {
    if (registration.installing !== null) {
      watchInstalling(registration.installing);
    }
  });
  watchForUpdates(registration);
};

/** Switches to the waiting worker and reloads once it controls the page. */
export const applyUpdate = (): void => {
  const { waiting } = store;
  if (waiting === undefined) {
    globalThis.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      globalThis.location.reload();
    },
    { once: true },
  );
  waiting.postMessage({ type: "skip-waiting" });
};
