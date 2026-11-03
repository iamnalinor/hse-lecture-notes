import { useSyncExternalStore } from "react";

import { isOfflineSupported } from "#web/api/offline-cache.ts";

import { whenPageSettled } from "./background-download.ts";

const UPDATE_CHECK_MS = 60_000;
const FRESH_REPLY_MS = 1000;
const SWITCH_TIMEOUT_MS = 3000;
const REACHABLE_TIMEOUT_MS = 1500;

/**
`hasUpdate`: the site changed since this tab loaded — a new worker is waiting, or another tab
already switched to it and this page runs the old code under the new worker.
*/
const store: {
  /** The worker this page switches to quietly; its controller change shows no banner. */
  adopting: ServiceWorker | undefined;
  /**
  The old worker loaded this page of a newer deploy from the network (`service-worker.ts`): its
  code is already new, so the first switch of worker needs no reload. Spent by that switch.
  */
  fresh: Promise<boolean>;
  hasUpdate: boolean;
  registration: ServiceWorkerRegistration | undefined;
  /** A worker switch with a page load is under way: further clicks wait for it. */
  switching: boolean;
} = {
  adopting: undefined,
  fresh: Promise.resolve(false),
  hasUpdate: false,
  registration: undefined,
  switching: false,
};
const listeners = new Set<() => void>();
/** Workers already handled: `updatefound` and the startup check may report the same one. */
const handled = new WeakSet<ServiceWorker>();

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

/** Whether this page may take the new worker without a reload; true at most once. */
const isFreshOnce = async (): Promise<boolean> => {
  const isFresh = await store.fresh;
  store.fresh = Promise.resolve(false);
  return isFresh;
};

const adopt = (worker: ServiceWorker): void => {
  store.adopting = worker;
  worker.addEventListener("statechange", () => {
    if (worker.state === "redundant" && store.adopting === worker) {
      store.adopting = undefined;
    }
  });
  // Not while the page still loads through the old worker: Chrome then stops that worker mid-request,
  // the new one may never activate, and the next page load hangs. Once the page is idle the switch
  // is like a press of «Обновить».
  whenPageSettled(() => {
    worker.postMessage({ type: "skip-waiting" });
  });
};

/**
A new worker is waiting. A page that already runs the new code switches to it quietly (other tabs
see the controller change and offer to reload), any other page offers to reload.
*/
const onWaiting = async (worker: ServiceWorker): Promise<void> => {
  if (handled.has(worker)) {
    return;
  }
  handled.add(worker);
  if (await isFreshOnce()) {
    adopt(worker);
    return;
  }
  markUpdate();
};

const watchInstalling = (worker: ServiceWorker): void => {
  worker.addEventListener("statechange", () => {
    // Without a controller this is the first install, not an update.
    if (worker.state === "installed" && navigator.serviceWorker.controller !== null) {
      void onWaiting(worker);
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

/**
«Обновить» in another tab activates the new worker for every tab: this one has to reload too —
unless it is the switch this page asked for, or the page already runs the new code.
*/
const watchControllerChange = (): void => {
  let previous = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const { controller } = navigator.serviceWorker;
    // From no controller to one is the first install claiming the page, not an update.
    const isUpdate = previous !== null;
    const isAdopted = controller !== null && controller === store.adopting;
    previous = controller;
    store.adopting = undefined;
    if (!isUpdate || isAdopted) {
      return;
    }
    void (async () => {
      if (!(await isFreshOnce())) {
        markUpdate();
      }
    })();
  });
};

const unregisterAll = async (): Promise<void> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(async (registration) => await registration.unregister()));
};

/** Listeners first, so that no event is missed while the worker answers about freshness. */
const watchRegistration = (registration: ServiceWorkerRegistration): void => {
  const { controller } = navigator.serviceWorker;
  store.fresh = controller === null ? Promise.resolve(false) : wasLoadedFresh(controller);
  watchControllerChange();
  registration.addEventListener("updatefound", () => {
    if (registration.installing !== null) {
      watchInstalling(registration.installing);
    }
  });
  if (controller !== null && registration.waiting !== null) {
    void onWaiting(registration.waiting);
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
  watchRegistration(registration);
  watchForUpdates(registration);
};

/**
Switches to the waiting worker, then loads the page with `load` once the new worker controls it
(or after `SWITCH_TIMEOUT_MS`, if the switch does not happen: never leave a click hanging).
*/
const switchWorker = (load: () => void): void => {
  store.switching = true;
  // Read at the click: another tab may have activated the worker this banner was shown for.
  const waiting = store.registration?.waiting ?? null;
  if (waiting === null) {
    load();
    return;
  }
  let isLoading = false;
  const loadOnce = (): void => {
    if (isLoading) {
      return;
    }
    isLoading = true;
    load();
  };
  navigator.serviceWorker.addEventListener("controllerchange", loadOnce, { once: true });
  setTimeout(loadOnce, SWITCH_TIMEOUT_MS);
  waiting.postMessage({ type: "skip-waiting" });
};

/** «Обновить»: switches to the waiting worker and reloads. */
export const applyUpdate = (): void => {
  switchWorker(() => {
    globalThis.location.reload();
  });
};

/** The page answers from the network: the new version can load it (HEAD bypasses the worker). */
const isReachable = async (href: string): Promise<boolean> => {
  try {
    // Any answer will do: a 404 is a renamed lecture, which the new version redirects.
    await fetch(href, {
      cache: "no-store",
      method: "HEAD",
      signal: AbortSignal.timeout(REACHABLE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
};

/**
A link followed while an update is pending: the new version of the site opens at `href`. False
when the network does not answer: switching now would drop the outdated offline copies the new
worker cannot replace, so the link opens in the old code.
*/
export const didOpenUpdated = async (href: string): Promise<boolean> => {
  if (store.switching) {
    return true;
  }
  if (!(await isReachable(href))) {
    return false;
  }
  switchWorker(() => {
    globalThis.location.assign(href);
  });
  return true;
};
