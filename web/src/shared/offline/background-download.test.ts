import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BackgroundPhase,
  type BackgroundPlan,
  scheduleBackgroundDownload,
  waitTurn,
  whenPageSettled,
} from "./background-download.ts";

/** `navigator.connection` whose link the test switches. */
class FakeConnection extends EventTarget {
  effectiveType: string | undefined = "4g";
  saveData = false;
  type: string | undefined;

  constructor(type: string | undefined) {
    super();
    this.type = type;
  }

  switchTo(change: { readonly saveData?: boolean; readonly type?: string }): void {
    this.type = change.type ?? this.type;
    this.saveData = change.saveData ?? this.saveData;
    this.dispatchEvent(new Event("change"));
  }
}

type Run = {
  readonly finish: () => void;
  readonly signal: AbortSignal;
};

/** A plan whose start, runs and phases the test drives and inspects. */
const harness = (connection: FakeConnection | undefined) => {
  const runs: Run[] = [];
  const phases: BackgroundPhase[] = [];
  const settled = { start: (): void => undefined };
  const cancelSettled = vi.fn();
  const plan: BackgroundPlan = {
    connection,
    onPhase: (phase) => {
      phases.push(phase);
    },
    run: async (signal) => {
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
        runs.push({ finish: resolve, signal });
      });
    },
    whenSettled: (start) => {
      settled.start = start;
      return cancelSettled;
    },
  };
  return {
    cancelSettled,
    phases,
    plan,
    runs,
    settle: () => {
      settled.start();
    },
  };
};

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve));
};

describe("scheduleBackgroundDownload", () => {
  it("does nothing without the Network Information API", () => {
    const { plan, runs, settle } = harness(undefined);
    scheduleBackgroundDownload(plan);
    settle();
    expect(runs).toHaveLength(0);
  });

  it("waits until the page has settled, then downloads on Wi-Fi", () => {
    const { phases, plan, runs, settle } = harness(new FakeConnection("wifi"));
    scheduleBackgroundDownload(plan);
    expect(runs).toHaveLength(0);
    settle();
    expect(runs).toHaveLength(1);
    expect(phases).toEqual(["running"]);
  });

  it("never starts on cellular or when the type is unknown", () => {
    for (const type of ["cellular", undefined]) {
      const connection = new FakeConnection(type);
      const { plan, runs, settle } = harness(connection);
      scheduleBackgroundDownload(plan);
      settle();
      connection.switchTo({ saveData: false });
      expect(runs).toHaveLength(0);
    }
  });

  it("stops when the connection turns cellular and resumes on Wi-Fi", async () => {
    const connection = new FakeConnection("wifi");
    const { phases, plan, runs, settle } = harness(connection);
    scheduleBackgroundDownload(plan);
    settle();
    connection.switchTo({ type: "cellular" });
    expect(runs[0]?.signal.aborted).toBe(true);
    await flush();
    expect(phases).toEqual(["running", "paused"]);
    connection.switchTo({ type: "wifi" });
    expect(runs).toHaveLength(2);
    expect(phases).toEqual(["running", "paused", "running"]);
  });

  it("stops when the reader turns on data saving", () => {
    const connection = new FakeConnection("wifi");
    const { plan, runs, settle } = harness(connection);
    scheduleBackgroundDownload(plan);
    settle();
    connection.switchTo({ saveData: true });
    expect(runs[0]?.signal.aborted).toBe(true);
  });

  it("starts later if the connection turns Wi-Fi after the page settled", () => {
    const connection = new FakeConnection("cellular");
    const { plan, runs, settle } = harness(connection);
    scheduleBackgroundDownload(plan);
    settle();
    connection.switchTo({ type: "wifi" });
    expect(runs).toHaveLength(1);
  });

  it("does not start again once complete", async () => {
    const connection = new FakeConnection("wifi");
    const { phases, plan, runs, settle } = harness(connection);
    scheduleBackgroundDownload(plan);
    settle();
    runs[0]?.finish();
    await flush();
    connection.switchTo({ type: "cellular" });
    connection.switchTo({ type: "wifi" });
    expect(runs).toHaveLength(1);
    expect(phases).toEqual(["running", "done"]);
  });

  it("does not retry after a failure", async () => {
    const connection = new FakeConnection("wifi");
    const { phases, plan, settle } = harness(connection);
    const run = vi.fn(async () => {
      await Promise.reject(new Error("404"));
    });
    scheduleBackgroundDownload({ ...plan, run });
    settle();
    await flush();
    connection.switchTo({ type: "wifi" });
    expect(run).toHaveBeenCalledOnce();
    expect(phases).toEqual(["running", "failed"]);
  });

  it("pauses, not fails, when the link drops before its change event", async () => {
    const connection = new FakeConnection("wifi");
    const { phases, plan, settle } = harness(connection);
    const run = vi.fn(async () => {
      connection.type = "cellular";
      await Promise.reject(new Error("network"));
    });
    scheduleBackgroundDownload({ ...plan, run });
    settle();
    await flush();
    expect(phases).toEqual(["running", "paused"]);
    connection.switchTo({ type: "wifi" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stop aborts the download and cancels a pending start", async () => {
    const connection = new FakeConnection("wifi");
    const { cancelSettled, phases, plan, runs, settle } = harness(connection);
    const stop = scheduleBackgroundDownload(plan);
    settle();
    stop();
    expect(cancelSettled).toHaveBeenCalledOnce();
    expect(runs[0]?.signal.aborted).toBe(true);
    await flush();
    connection.switchTo({ type: "wifi" });
    expect(runs).toHaveLength(1);
    expect(phases).toEqual(["running"]);
  });
});

describe("whenPageSettled", () => {
  const idle: { callback: (() => void) | undefined } = { callback: undefined };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    idle.callback = undefined;
    vi.stubGlobal("requestIdleCallback", (task: () => void) => {
      idle.callback = task;
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", () => {
      idle.callback = undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts in an idle period a few seconds after load", () => {
    const start = vi.fn();
    whenPageSettled(start);
    vi.advanceTimersByTime(4000);
    expect(idle.callback).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(start).not.toHaveBeenCalled();
    idle.callback?.();
    expect(start).toHaveBeenCalledOnce();
  });

  it("can be cancelled before it starts", () => {
    const start = vi.fn();
    const cancel = whenPageSettled(start);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(idle.callback).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });
});

describe("waitTurn", () => {
  it("waits while the page loads something of its own", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestIdleCallback", (task: () => void) => setTimeout(task));
    const busy = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    const turn = waitTurn(busy);
    await vi.runAllTimersAsync();
    await turn;
    expect(busy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
