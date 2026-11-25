export class TelegramLoginCancelled extends Error {
  override readonly name = "TelegramLoginCancelled";
}

/** Stops waiting even when an SDK or a browser API does not support AbortSignal. */
export const awaitWithSignal = async <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  signal.throwIfAborted();
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    const reason: unknown = signal.reason;
    aborted.reject(reason instanceof Error ? reason : new Error("Request cancelled"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([promise, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};
