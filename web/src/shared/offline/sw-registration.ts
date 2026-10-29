import { useSyncExternalStore } from "react";

import { isOfflineSupported } from "#web/api/offline-cache.ts";

const UPDATE_CHECK_MS = 60_000;

/**
`hasUpdate`: the site changed since this tab loaded — a new worker is waiting, or another tab
already switched to it and this page runs the old code under the new worker.
*/
const store: { hasUpdate: boolean; registration: ServiceWorkerRegistration | undefined } = {
  hasUpdate: false,
  registration: undefined,
};
const listeners = new Set<() => void>();

const markUpdate = (): void => {
  store.hasUpdate = true;
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
    () => store.hasUpdate,
    () => false,
  );

const watchInstalling = (worker: ServiceWorker): void => {
  worker.addEventListener("statechange", () => {
    // Without a controller this is the first install, not an update.
    if (worker.state === "installed" && navigator.serviceWorker.controller !== null) {
      markUpdate();
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

/** «Обновить» in another tab activates the new worker for every tab: this one has to reload too. */
const watchControllerChange = (): void => {
  let previous = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // From no controller to one is the first install claiming the page, not an update.
    if (previous !== null) {
      markUpdate();
    }
    previous = navigator.serviceWorker.controller;
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
  store.registration = registration;
  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
    markUpdate();
  }
  watchControllerChange();
  registration.addEventListener("updatefound", () => {
    if (registration.installing !== null) {
      watchInstalling(registration.installing);
    }
  });
  watchForUpdates(registration);
};

/** Switches to the waiting worker and reloads once it controls the page. */
export const applyUpdate = (): void => {
  // Read at the click: another tab may have activated the worker this banner was shown for.
  const waiting = store.registration?.waiting ?? null;
  if (waiting === null) {
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
