import { useSyncExternalStore } from "react";

import { isOfflineSupported } from "#web/api/offline-cache.ts";

const UPDATE_CHECK_MS = 60_000;
const FRESH_REPLY_MS = 1000;

/**
`hasUpdate`: the site changed since this tab loaded — a new worker is waiting, or another tab
already switched to it and this page runs the old code under the new worker.
*/
const store: {
  /** The next controller change is this page adopting the new worker: no banner. */
  adopting: boolean;
  hasUpdate: boolean;
  /** The old worker loaded this page of a newer deploy from the network (`service-worker.ts`). */
  isFresh: boolean;
  registration: ServiceWorkerRegistration | undefined;
} = {
  adopting: false,
  hasUpdate: false,
  isFresh: false,
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

/**
A new worker is waiting. A page that already runs the new code switches to it quietly (other tabs
see the controller change and offer to reload), any other page offers to reload.
*/
const onWaiting = (worker: ServiceWorker): void => {
  if (!store.isFresh) {
    markUpdate();
    return;
  }
  store.isFresh = false;
  store.adopting = true;
  worker.postMessage({ type: "skip-waiting" });
};

const watchInstalling = (worker: ServiceWorker): void => {
  worker.addEventListener("statechange", () => {
    // Without a controller this is the first install, not an update.
    if (worker.state === "installed" && navigator.serviceWorker.controller !== null) {
      onWaiting(worker);
    }
  });
};

/** Asks the worker whether it loaded this page from the network; a worker without the answer → no. */
const wasLoadedFresh = async (controller: ServiceWorker): Promise<boolean> =>
  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      resolve(false);
    }, FRESH_REPLY_MS);
    channel.port1.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(event.data === true);
    });
    channel.port1.start();
    controller.postMessage({ type: "is-fresh" }, [channel.port2]);
  });

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
    if (previous !== null && !store.adopting) {
      markUpdate();
    }
    store.adopting = false;
    previous = navigator.serviceWorker.controller;
  });
};

const unregisterAll = async (): Promise<void> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(async (registration) => await registration.unregister()));
};

const watchRegistration = async (registration: ServiceWorkerRegistration): Promise<void> => {
  const { controller } = navigator.serviceWorker;
  store.isFresh = controller !== null && (await wasLoadedFresh(controller));
  watchControllerChange();
  if (controller !== null && registration.waiting !== null) {
    onWaiting(registration.waiting);
  }
  // The worker that served a fresh page starts the update itself: it may be installing already.
  if (registration.installing !== null) {
    watchInstalling(registration.installing);
  }
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
  await watchRegistration(registration);
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
