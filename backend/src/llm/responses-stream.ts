import type { LlmRoundResult } from "../types";
import { parseOutput } from "./responses/output-items";
import { SseEventAccumulator } from "./responses/sse-events";
import { ResponseEofError } from "./socks5-fetch";

export class LlmUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_EVENT_BUFFER_CHARS = 1_000_000;

/**
 * Reads the stream line by line into `acc` until the terminal event, truncation or end of stream.
 * A transport failure after the first event is reported (true) instead of thrown, so the partial
 * response can still be settled.
 */
async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  acc: SseEventAccumulator,
): Promise<{ transportFailed: boolean }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let transportFailed = false;
  while (!acc.terminal && !acc.truncated) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch (error) {
      if (!acc.sawEvent) throw new ResponseEofError("before_event");
      transportFailed = true;
      break;
    }
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    if (buffer.length > MAX_EVENT_BUFFER_CHARS) {
      acc.truncate("event_too_large");
      break;
    }
    let i = buffer.indexOf("\n");
    while (i >= 0 && !acc.terminal && !acc.truncated) {
      const line = buffer.slice(0, i).replace(/\r$/u, "");
      buffer = buffer.slice(i + 1);
      if (line.startsWith("event: response.")) acc.sawEvent = true;
      if (line.startsWith("data:")) acc.process(line.slice(5));
      i = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (!acc.terminal && !acc.truncated)
    for (const line of buffer.split(/\r?\n/u))
      if (line.startsWith("data:")) acc.process(line.slice(5));
  return { transportFailed };
}

/** Item-aware SSE gate; full terminal output is validated independently of deltas. */
export async function parseResponsesSseStream(
  body: ReadableStream<Uint8Array>,
  maxResponseChars: number,
  onDelta: (delta: string) => void,
  onTruncateAbort?: () => void,
  upstream: "codex" | "openai" = "codex",
  options: { enforceProtocol?: boolean; hideText?: boolean } = {},
): Promise<LlmRoundResult> {
  const reader = body.getReader();
  const strict = options.enforceProtocol ?? false;
  const acc = new SseEventAccumulator({
    maxResponseChars,
    onDelta,
    onTruncateAbort,
    strict,
    hideText: options.hideText ?? false,
  });

  let transportFailed: boolean;
  try {
    ({ transportFailed } = await readEvents(reader, acc));
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!acc.sawEvent) throw new ResponseEofError("before_event");

  const parsed = parseOutput(acc.finalOutput ?? acc.doneItems, strict);
  acc.violations.push(...parsed.violations);
  if (parsed.text.length > maxResponseChars) acc.truncated = true;
  acc.observedOutputChars = Math.max(
    acc.observedOutputChars,
    Math.min(parsed.text.length, maxResponseChars),
  );
  let text = acc.streamedText || (options.hideText ? "" : parsed.text.slice(0, maxResponseChars));
  if (parsed.refusal && !text && !options.hideText)
    text = parsed.refusal.slice(0, maxResponseChars);
  return {
    completed: acc.completed && !acc.truncated && !transportFailed,
    status: acc.truncated ? "truncated" : acc.status,
    text,
    truncated: acc.truncated,
    observedOutputChars: acc.observedOutputChars,
    outputItems: parsed.outputItems,
    functionCalls: parsed.functionCalls,
    usage: acc.usage,
    responseId: acc.responseId,
    protocolViolations: [...new Set(acc.violations)],
    ...(parsed.refusal ? { refusal: parsed.refusal } : {}),
  };
}
