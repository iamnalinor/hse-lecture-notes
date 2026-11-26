import { z } from "zod";

import { block, degraded, messageStatus, step, suggestion } from "./response-schemas.ts";

const run = {
  runId: z.string(),
  degraded,
  replayed: z.boolean().exactOptional(),
  contextLimited: z.boolean().catch(false),
};

const frames = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("meta"),
    ...run,
    threadId: z.string(),
    assistantMessageId: z.string(),
    userMessageId: z.string(),
    threadTitle: z.string(),
    generatedTitle: z.string().nullable().exactOptional(),
  }),
  z.object({
    type: z.literal("done"),
    ...run,
    text: z.string(),
    status: messageStatus,
    steps: z.array(step),
    block: block.nullable(),
    errorMessage: z.string().nullable().catch(null),
    suggestion,
  }),
  z.object({ type: z.literal("step"), steps: z.array(step) }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("title"), threadId: z.string(), title: z.string() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string().trim().min(1),
    retryAfterSec: z.number().exactOptional(),
    block: block.nullable().exactOptional(),
  }),
]);

export type StreamFrame = z.output<typeof frames>;

const knownTypes = new Set<string>(frames.options.map((frame) => frame.shape.type.value));
const envelope = z.object({ type: z.string().min(1) });

export const parseStreamFrame = (
  raw: string,
): null | StreamFrame | { readonly type: "unknown" } => {
  try {
    const value: unknown = JSON.parse(raw);
    const result = frames.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const header = envelope.safeParse(value);
    return header.success && !knownTypes.has(header.data.type) ? { type: "unknown" } : null;
  } catch {
    return null;
  }
};
