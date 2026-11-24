/** Observes a rejection before the test triggers cancellation, avoiding unhandled promises. */
export const captureRejection = async (pending: Promise<unknown>): Promise<Error> => {
  try {
    await pending;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("Expected an Error rejection", { cause: error });
  }
  throw new Error("Expected a rejection");
};
