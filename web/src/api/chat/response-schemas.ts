import { z } from "zod";

import { parseChatSuggestion } from "#web/domain/chat/model.ts";

export const UserSchema = z.object({ id: z.number(), name: z.string() });
export const TierSchema = z.enum(["default", "extended", "student"]);
export const TelegramSessionSchema = z.object({
  browserToken: z.string().min(1),
  sessionToken: z.string().min(1),
  tier: TierSchema,
  user: UserSchema,
});

export const degraded = z.object({
  active: z.boolean(),
  restoresAt: z.number().nullable().exactOptional(),
});

export const block = z.object({
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

export const step = z.object({
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

export const messageStatus = z.enum(["done", "error", "incomplete", "running", "stopped"]);
export const suggestion = z.unknown().transform(parseChatSuggestion).default(null);

const visitor = z.union([
  z.object({ tier: z.literal("guest"), user: z.null() }),
  z.object({ tier: TierSchema, user: UserSchema }),
]);
const allowance = z
  .object({
    browserToken: z.string().min(1),
    allowanceToken: z.string().min(1),
    allowanceExpiresAt: z.number(),
    maxQuestionChars: z.number().int().positive().exactOptional(),
    degraded,
    block: block.nullable(),
  })
  .and(visitor);

export const parseAllowanceResponse = (data: unknown) => {
  const parsed = allowance.safeParse(data);
  if (!parsed.success) {
    throw new Error("Не удалось прочитать ответ о доступе к чату. Попробуй еще раз.");
  }
  return parsed.data;
};

const message = z.object({
  id: z.string(),
  page: z.object({ course: z.string(), docId: z.string() }),
  seq: z.number().int(),
  role: z.enum(["user", "assistant"]),
  status: messageStatus,
  contentTex: z.string(),
  quote: z
    .object({
      label: z.string(),
      tex: z.string(),
      blockId: z.string().exactOptional(),
      messageId: z.string().exactOptional(),
      sectionId: z.string().exactOptional(),
    })
    .nullable(),
  steps: z.array(step),
  suggestion,
  runId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number(),
});

const summary = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  generatedTitle: z.string().nullable().exactOptional(),
  contextLimited: z.boolean().default(false),
});
export const threadResponse = z.object({
  threads: z.array(summary),
  thread: summary
    .extend({
      messages: z.array(message),
      createdAt: z.number(),
      beforeSeq: z.number().int().nullable().exactOptional(),
    })
    .nullable(),
  hasMore: z.boolean().exactOptional(),
  requestedThreadMissing: z.boolean(),
});

export const runStatusResponse = z.object({
  runId: z.string(),
  threadId: z.string(),
  assistantMessageId: z.string(),
  expiresAt: z.number(),
  status: messageStatus,
});
