import type { ChatStreamFrame } from "../types";

export function messageError(
  status: number,
  code: string,
  message: string,
  extra: Partial<Pick<Extract<ChatStreamFrame, { type: "error" }>, "block" | "retryAfterSec">> = {},
) {
  return Response.json(
    { type: "error", code, message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Thrown while validating a new request, to answer with `response` instead of admitting the run. */
export class MessageValidationError extends Error {
  constructor(readonly response: Response) {
    super("Message validation failed");
  }
}
