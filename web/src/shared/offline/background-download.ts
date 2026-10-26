/**
Background download of every document on an unmetered connection (the rule — `domain/connection.ts`).

It must not compete with what the reader opens:
- starts only after the page has loaded, then `START_DELAY_MS` more, then in an idle period;
- one file at a time at low network priority, each after an idle period with no request of the
  page itself in flight (`waitTurn`);
- stops at once when the connection turns cellular or the reader turns on data saving, and goes
  on if it turns back to Wi-Fi;
- runs to the end at most once: after it finishes (or fails) it is not started again.

A hidden tab keeps downloading: idle callbacks there still fire through their timeout, and the
reader who switched to another tab does not wait for this one.
*/
import { canAutoDownload, type ConnectionInfo } from "#web/domain/connection.ts";

/** `navigator.connection` as Chromium has it; the DOM types of TypeScript do not describe it. */
export type ConnectionLike = ConnectionInfo &
  Pick<EventTarget, "addEventListener" | "removeEventListener">;

export const currentConnection = (): ConnectionLike | undefined =>
  (navigator as Navigator & { readonly connection?: ConnectionLike }).connection;

const START_DELAY_MS = 5000;
const IDLE_TIMEOUT_MS = 2000;
const BUSY_RETRY_MS = 500;

/** Runs `task` in an idle period (or after `IDLE_TIMEOUT_MS` at most); returns a cancel. */
const onIdle = (task: () => void): (() => void) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => {
      globalThis.cancelIdleCallback(id);
    };
  }
  const timer = setTimeout(task, IDLE_TIMEOUT_MS);
  return () => {
    clearTimeout(timer);
  };
};

/** Runs `start` once the page has loaded, `START_DELAY_MS` has passed and the page is idle. */
export const whenPageSettled = (start: () => void): (() => void) => {
  const pending = { cancel: (): void => undefined };
  const afterLoad = (): void => {
    const timer = setTimeout(() => {
      pending.cancel = onIdle(start);
    }, START_DELAY_MS);
    pending.cancel = () => {
      clearTimeout(timer);
    };
  };
  if (document.readyState === "complete") {
    afterLoad();
  } else {
    globalThis.addEventListener("load", afterLoad, { once: true });
    pending.cancel = () => {
      globalThis.removeEventListener("load", afterLoad);
    };
  }
  return () => {
    pending.cancel();
  };
};

/** Resolves in an idle period in which `isBusy` (the page loads something) is false. */
export const waitTurn = async (isBusy: () => boolean): Promise<void> => {
  await new Promise<void>((resolve) => {
    onIdle(resolve);
  });
  if (!isBusy()) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
  await waitTurn(isBusy);
};

export type BackgroundPhase = "done" | "failed" | "paused" | "running";

export type BackgroundPlan = {
  readonly connection: ConnectionLike | undefined;
  readonly onPhase: (phase: BackgroundPhase) => void;
  /** The download; it rejects once `signal` aborts. */
  readonly run: (signal: AbortSignal) => Promise<void>;
  /** Runs `start` when it is time to begin (`whenPageSettled`); returns a cancel. */
  readonly whenSettled: (start: () => void) => () => void;
};

const attempt = async (
  run: BackgroundPlan["run"],
  signal: AbortSignal,
): Promise<"aborted" | "done" | "failed"> => {
  try {
    await run(signal);
    return "done";
  } catch {
    return signal.aborted ? "aborted" : "failed";
  }
};

/** Starts the download when allowed; returns «stop». No `navigator.connection` → never starts. */
export const scheduleBackgroundDownload = (plan: BackgroundPlan): (() => void) => {
  const { connection } = plan;
  if (connection === undefined) {
    return () => undefined;
  }
  const state = {
    controller: undefined as AbortController | undefined,
    isOver: false,
    isSettled: false,
  };
  const isBlocked = (): boolean =>
    state.isOver || !state.isSettled || state.controller !== undefined;
  const tryStart = async (): Promise<void> => {
    if (isBlocked() || !canAutoDownload(connection)) {
      return;
    }
    state.controller = new AbortController();
    plan.onPhase("running");
    const outcome = await attempt(plan.run, state.controller.signal);
    state.controller = undefined;
    if (state.isOver) {
      return;
    }
    if (outcome !== "aborted") {
      state.isOver = true;
      plan.onPhase(outcome);
      return;
    }
    plan.onPhase("paused");
    await tryStart();
  };
  const onChange = (): void => {
    if (state.controller !== undefined && !canAutoDownload(connection)) {
      state.controller.abort();
      return;
    }
    void tryStart();
  };
  connection.addEventListener("change", onChange);
  const cancelSettled = plan.whenSettled(() => {
    state.isSettled = true;
    void tryStart();
  });
  return () => {
    state.isOver = true;
    cancelSettled();
    connection.removeEventListener("change", onChange);
    state.controller?.abort();
  };
};
