import { readStoredAuth } from "./storage.ts";

const attemptStop = async (
  url: string,
  headers: Headers,
): Promise<"accepted" | "rejected" | "transient"> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return "accepted";
    }
    return response.status >= 500 || response.status === 408 || response.status === 429
      ? "transient"
      : "rejected";
  } catch {
    return "transient";
  }
};

const isStopAccepted = async (url: string, headers: Headers): Promise<boolean> => {
  const first = await attemptStop(url, headers);
  if (first !== "transient") {
    return first === "accepted";
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });
  const second = await attemptStop(url, headers);
  return second === "accepted";
};

export const createStopController = (
  apiUrl: string,
  browserToken: string,
  onStopError: (message: null | string) => void,
) => {
  const headers = new Headers({ "X-Browser-Token": browserToken });
  const { sessionToken } = readStoredAuth();
  if (sessionToken !== null) {
    headers.set("X-Session-Token", sessionToken);
  }
  let runId: null | string = null;
  let state: "accepted" | "failed" | "idle" | "requested" | "sending" = "idle";
  const sendIfReady = async (): Promise<void> => {
    if (state !== "requested" || runId === null) {
      return;
    }
    state = "sending";
    const isAccepted = await isStopAccepted(
      `${apiUrl}/v1/runs/${encodeURIComponent(runId)}/stop`,
      headers,
    );
    state = isAccepted ? "accepted" : "failed";
    onStopError(isAccepted ? null : "Не удалось остановить ответ. Нажми «Остановить» ещё раз.");
  };
  return {
    stop: () => {
      if (!(state === "idle" || state === "failed")) {
        return;
      }

      state = "requested";
      void sendIfReady();
    },
    setRun: (id: string) => {
      runId = id;
      void sendIfReady();
    },
    isWaitingForMeta: () => state === "requested" && runId === null,
  };
};
