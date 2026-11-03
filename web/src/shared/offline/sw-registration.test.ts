import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#web/api/offline-cache.ts", () => ({ isOfflineSupported: () => true }));

/** Tasks waiting for the page to settle; `pageSettles` runs them. */
const settleQueue: (() => void)[] = [];
vi.mock("./background-download.ts", () => ({
  whenPageSettled: (start: () => void) => {
    settleQueue.push(start);
    return () => {
      settleQueue.splice(settleQueue.indexOf(start) >>> 0, 1);
    };
  },
}));

const pageSettles = (): void => {
  for (const start of settleQueue.splice(0)) {
    start();
  }
};

type Message = { readonly type: string };

/** A service worker that records what the page posts and answers «is-fresh». */
class FakeWorker extends EventTarget {
  private readonly isFresh: boolean;
  readonly posted: string[] = [];
  state: ServiceWorkerState;

  constructor(state: ServiceWorkerState, isFresh = false) {
    super();
    this.state = state;
    this.isFresh = isFresh;
  }

  postMessage(message: Message, transfer: readonly MessagePort[] = []): void {
    this.posted.push(message.type);
    if (message.type === "is-fresh") {
      transfer[0]?.postMessage(this.isFresh);
    }
  }

  becomes(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;

  update = vi.fn(() => Promise.resolve(this));

  startInstall(worker: FakeWorker): void {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null;
  readonly registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));

  constructor(controller: FakeWorker | null) {
    super();
    this.controller = controller;
  }

  switchTo(worker: FakeWorker): void {
    this.controller = worker;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

const setup = async (options: { readonly isFresh: boolean; readonly waiting?: FakeWorker }) => {
  const container = new FakeContainer(new FakeWorker("activated", options.isFresh));
  container.registration.waiting = options.waiting ?? null;
  vi.stubGlobal("navigator", { onLine: true, serviceWorker: container });
  const module = await import("./sw-registration.ts");
  await module.registerServiceWorker();
  const banner = renderHook(() => module.useHasUpdate());
  const hasBanner = (): boolean => banner.result.current;
  return { container, hasBanner, module };
};

/** Lets the freshness answer and the async handlers run. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
};

describe("registerServiceWorker", () => {
  beforeEach(() => {
    vi.resetModules();
    settleQueue.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers to reload when a new worker is already waiting", async () => {
    const { hasBanner } = await setup({ isFresh: false, waiting: new FakeWorker("installed") });
    await settle();
    expect(hasBanner()).toBe(true);
  });

  it("switches a fresh page to the new worker quietly once the page settles", async () => {
    const { container, hasBanner } = await setup({ isFresh: true });
    const next = new FakeWorker("installing");
    container.registration.startInstall(next);
    next.becomes("installed");
    await settle();
    // Not while the page still loads through the old worker.
    expect(next.posted).toStrictEqual([]);
    pageSettles();
    expect(next.posted).toStrictEqual(["skip-waiting"]);
    container.switchTo(next);
    await settle();
    expect(hasBanner()).toBe(false);
  });

  it("handles a worker seen twice once", async () => {
    const container = new FakeContainer(new FakeWorker("activated", true));
    const next = new FakeWorker("installing");
    container.registration.installing = next;
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: container });
    const module = await import("./sw-registration.ts");
    await module.registerServiceWorker();
    // The same worker also arrives through `updatefound`.
    container.registration.dispatchEvent(new Event("updatefound"));
    next.becomes("installed");
    await settle();
    pageSettles();
    expect(next.posted).toStrictEqual(["skip-waiting"]);
    expect(renderHook(() => module.useHasUpdate()).result.current).toBe(false);
  });

  it("offers to reload when another tab switched an old page", async () => {
    const { container, hasBanner } = await setup({ isFresh: false });
    container.switchTo(new FakeWorker("activated"));
    await settle();
    expect(hasBanner()).toBe(true);
  });

  it("keeps a fresh page quiet when another tab switches first", async () => {
    const { container, hasBanner } = await setup({ isFresh: true });
    container.switchTo(new FakeWorker("activated"));
    await settle();
    expect(hasBanner()).toBe(false);
  });

  it("is fresh for one switch only", async () => {
    const { container, hasBanner } = await setup({ isFresh: true });
    container.switchTo(new FakeWorker("activated"));
    await settle();
    container.switchTo(new FakeWorker("activated"));
    await settle();
    expect(hasBanner()).toBe(true);
  });
});

/** Whether `promise` has settled after the pending handlers ran. */
const isSettled = async (promise: Promise<void>): Promise<boolean> => {
  let isDone = false;
  void (async () => {
    await promise;
    isDone = true;
  })();
  await settle();
  return isDone;
};

describe("whenOnOwnWorker", () => {
  beforeEach(() => {
    vi.resetModules();
    settleQueue.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves at once on a page that is not fresh", async () => {
    const { module } = await setup({ isFresh: false });
    expect(await isSettled(module.whenOnOwnWorker({ hurry: false }))).toBe(true);
  });

  it("waits on a fresh page until it switched to the new worker", async () => {
    const { container, module } = await setup({ isFresh: true });
    const owned = module.whenOnOwnWorker({ hurry: false });
    const next = new FakeWorker("installing");
    container.registration.startInstall(next);
    next.becomes("installed");
    expect(await isSettled(owned)).toBe(false);
    pageSettles();
    container.switchTo(next);
    expect(await isSettled(owned)).toBe(true);
  });

  it("switches at once on a click, before the page settles", async () => {
    const { container, module } = await setup({ isFresh: true });
    const owned = module.whenOnOwnWorker({ hurry: true });
    const next = new FakeWorker("installing");
    container.registration.startInstall(next);
    next.becomes("installed");
    await settle();
    expect(next.posted).toStrictEqual(["skip-waiting"]);
    pageSettles();
    expect(next.posted).toStrictEqual(["skip-waiting"]);
    container.switchTo(next);
    expect(await isSettled(owned)).toBe(true);
  });

  it("stops waiting when the new worker is gone", async () => {
    const { container, module } = await setup({ isFresh: true });
    const owned = module.whenOnOwnWorker({ hurry: false });
    const next = new FakeWorker("installing");
    container.registration.startInstall(next);
    next.becomes("installed");
    await settle();
    next.becomes("redundant");
    expect(await isSettled(owned)).toBe(true);
    pageSettles();
    expect(next.posted).toStrictEqual([]);
  });
});

describe("didOpenUpdated", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays in the old code when the network does not answer", async () => {
    const waiting = new FakeWorker("installed");
    const { module } = await setup({ isFresh: false, waiting });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await module.didOpenUpdated("/algebra")).toBe(false);
    expect(waiting.posted).toStrictEqual([]);
  });

  it("switches to the waiting worker when the network answers", async () => {
    const waiting = new FakeWorker("installed");
    const { module } = await setup({ isFresh: false, waiting });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    expect(await module.didOpenUpdated("/algebra")).toBe(true);
    expect(waiting.posted).toStrictEqual(["skip-waiting"]);
  });
});
