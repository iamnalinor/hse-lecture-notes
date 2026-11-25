import { z } from "zod";

import { parseChatSuggestion } from "#web/domain/chat/model.ts";

const degraded = z.object({
  active: z.boolean(),
  restoresAt: z.number().nullable().exactOptional(),
});

const block = z.object({
  code: z.enum([
    "auth_required",
    "concurrent_run",
    "global_budget_exceeded",
    "guest_budget_exceeded",
    "oauth_unavailable",
    "rate_limited",
    "service_unavailable",
    "tier_quota_exceeded",
  ]),
  retryAfterSec: z.number().nullable().exactOptional(),
  nextAvailableAt: z.number().nullable().exactOptional(),
});

const step = z.object({
  kind: z.enum(["note", "read", "sample", "search"]),
  state: z.enum(["done", "error", "running"]),
  count: z.number().exactOptional(),
  more: z.number().exactOptional(),
  note: z.string().exactOptional(),
  q: z.string().exactOptional(),
  target: z.string().exactOptional(),
  res: z.array(z.string()).exactOptional(),
  links: z.array(z.string()).exactOptional(),
});

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
    status: z.enum(["done", "error", "incomplete", "running", "stopped"]),
    steps: z.array(step),
    block: block.nullable(),
    errorMessage: z.string().nullable().catch(null),
    suggestion: z.unknown().transform(parseChatSuggestion).default(null),
  }),
  z.object({ type: z.literal("step"), steps: z.array(step) }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("title"), threadId: z.string(), title: z.string() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string().trim().min(1),
    maxQuestionChars: z.number().int().positive().exactOptional(),
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
