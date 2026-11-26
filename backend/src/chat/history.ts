import { sha256Hex } from "../crypto";
import type { TrackedD1 } from "../db";
import { buildSystemPrompt } from "./tools";
import type {
  AgentReplayEnvelope,
  CodexInputItem,
  QuotePayload,
  ReplayProvenance,
  ServicePolicy,
  TurnContextSnapshot,
} from "../types";

export interface HistoryExchange {
  logicalMessages: number;
  items: CodexInputItem[];
}
export interface HistoryWindow {
  items: CodexInputItem[];
  logicalMessages: number;
  serializedChars: number;
  limitReached: boolean;
  trimmed: boolean;
}
export interface PreparedTurnContext {
  snapshot: TurnContextSnapshot;
  history: HistoryWindow;
  expectedMaxSeq: number;
  expectedContextRevision: number;
  provenance: ReplayProvenance;
}
type Limits = Pick<ServicePolicy, "maxHistoryMessages" | "maxHistoryChars">;
export type ReplayRoute = Pick<ReplayProvenance, "provider" | "model" | "effort">;
export class ContextSizeError extends Error {
  constructor() {
    super("context_too_large");
  }
}
const message = (role: "user" | "assistant" | "developer", text: string): CodexInputItem => ({
  type: "message",
  role,
  content: [{ type: role === "assistant" ? "output_text" : "input_text", text }],
});
export const snapshotItems = (s: TurnContextSnapshot) => [...s.contextItems, s.userItem];

export function selectHistoryWindow(
  exchanges: HistoryExchange[],
  current: TurnContextSnapshot,
  limits: Limits,
): HistoryWindow {
  const tail = snapshotItems(current);
  if (JSON.stringify(tail).length > limits.maxHistoryChars || limits.maxHistoryMessages < 1)
    throw new ContextSizeError();
  const totalMessages = 1 + exchanges.reduce((n, e) => n + e.logicalMessages, 0);
  const totalChars = JSON.stringify([...exchanges.flatMap((e) => e.items), ...tail]).length;
  let chosen = [...exchanges];
  let logicalMessages = totalMessages;
  let items = [...chosen.flatMap((e) => e.items), ...tail];
  while (
    chosen.length &&
    (logicalMessages > limits.maxHistoryMessages ||
      JSON.stringify(items).length > limits.maxHistoryChars)
  ) {
    logicalMessages -= chosen.shift()!.logicalMessages;
    items = [...chosen.flatMap((e) => e.items), ...tail];
  }
  return {
    items,
    logicalMessages,
    serializedChars: JSON.stringify(items).length,
    limitReached:
      totalMessages >= limits.maxHistoryMessages || totalChars >= limits.maxHistoryChars,
    trimmed: chosen.length !== exchanges.length,
  };
}

/**
 * D1 rejects a row above 2,000,000 bytes. The replay envelope shares its row with the
 * visible answer, steps and prompt snapshot, so it gets half of that limit.
 */
export const MAX_REPLAY_ENVELOPE_BYTES = 1_000_000;

/**
 * Serializes the model-side continuation for storage. Returns null when it does not
 * fit the byte cap: the next turn then replays the visible text instead.
 */
export function encodeEnvelope(envelope: AgentReplayEnvelope): string | null {
  const json = JSON.stringify(envelope);
  // Counted in UTF-8 bytes: Cyrillic is two bytes per character, so string length lies.
  return new TextEncoder().encode(json).length <= MAX_REPLAY_ENVELOPE_BYTES ? json : null;
}

function decodeSnapshot(raw: string | null): TurnContextSnapshot | null {
  try {
    const s = JSON.parse(raw ?? "null") as TurnContextSnapshot | null;
    if (
      s?.version !== 1 ||
      !Array.isArray(s.contextItems) ||
      s.userItem?.type !== "message" ||
      s.userItem.role !== "user"
    )
      return null;
    // The original snapshot format included a conversation-derived title in
    // the first line of developer context. Remove it on replay and retry.
    const first = s.contextItems[0];
    const part = first?.type === "message" && first.role === "developer" ? first.content[0] : null;
    if (part?.text.startsWith("{")) {
      const newline = part.text.indexOf("\n");
      if (newline !== -1) {
        const state = JSON.parse(part.text.slice(0, newline));
        if (Object.hasOwn(state, "title")) {
          delete state.title;
          part.text = JSON.stringify(state) + part.text.slice(newline);
        }
      }
    }
    return s;
  } catch {
    return null;
  }
}
function decodeEnvelope(raw: string | null): AgentReplayEnvelope | null {
  try {
    const e = JSON.parse(raw ?? "null") as AgentReplayEnvelope | null;
    if (e?.version !== 1 || !e.complete || !e.provenance || !Array.isArray(e.items)) return null;
    const pending = new Set<string>();
    for (const item of e.items) {
      if (item.type === "function_call") {
        if (!item.call_id || pending.has(item.call_id)) return null;
        pending.add(item.call_id);
      } else if (item.type === "function_call_output") {
        if (!pending.delete(item.call_id)) return null;
      } else if (item.type !== "message" && item.type !== "reasoning") return null;
    }
    return pending.size ? null : e;
  } catch {
    return null;
  }
}
interface Row {
  id: string;
  seq: number;
  role: string;
  status: string;
  content_tex: string;
  quote_json: string | null;
  prompt_context_json: string | null;
  agent_items_json: string | null;
  created_at: number;
  course: string;
  doc_id: string;
}
function userText(text: string, quote: QuotePayload | null): string {
  return quote ? `Цитата (${quote.label}):\n${quote.tex}\n\nВопрос студента:\n${text}` : text;
}
export function decodeStoredQuote(raw: string | null): QuotePayload | null {
  try {
    const quote = JSON.parse(raw ?? "null") as QuotePayload | null;
    return typeof quote?.tex === "string" && typeof quote.label === "string" ? quote : null;
  } catch {
    return null;
  }
}

function legacySnapshot(row: Row): TurnContextSnapshot {
  const quote = decodeStoredQuote(row.quote_json);
  return {
    version: 1,
    contextItems: [],
    userItem: message(
      "user",
      `Страница на момент вопроса: /${[row.course, row.doc_id].filter(Boolean).join("/")}\nВремя вопроса: ${new Date(row.created_at).toISOString()}\n\n${userText(row.content_tex, quote)}`,
    ),
    currentDocOrder: 0,
  };
}

export async function prepareTurnContext(
  db: TrackedD1,
  args: {
    threadId: string | null;
    retryAssistantMessageId?: string | null;
    course: string;
    docId: string;
    questionText: string;
    quote: QuotePayload | null;
    createdAt: number;
    generatedTitle: string | null;
    route: ReplayRoute;
    limits: Limits;
  },
): Promise<PreparedTurnContext> {
  const threadId = args.threadId ?? "";
  const [threadRes, rowsRes] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT context_revision, (SELECT COALESCE(MAX(seq),0) FROM chat_messages WHERE thread_id = ?) AS max_seq FROM chat_threads WHERE id = ?",
      )
      .bind(threadId, threadId),
    db
      .prepare(`SELECT id,seq,role,status,content_tex,quote_json,prompt_context_json,
      CASE WHEN length(agent_items_json) <= ? THEN agent_items_json ELSE NULL END AS agent_items_json,
      created_at,course,doc_id FROM chat_messages
      WHERE thread_id = ? ORDER BY seq DESC LIMIT ?`)
      .bind(args.limits.maxHistoryChars, threadId, args.limits.maxHistoryMessages + 4),
  ]);
  const thread = threadRes?.results[0];
  const rows = (rowsRes?.results ?? []) as unknown as Row[];
  let retryUser: Row | undefined;
  if (args.retryAssistantMessageId) {
    const assistant = rows.find((r) => r.id === args.retryAssistantMessageId);
    retryUser = rows.find((r) => r.role === "user" && r.seq === (assistant?.seq ?? 0) - 1);
  }
  let snapshot = retryUser
    ? (decodeSnapshot(retryUser.prompt_context_json) ?? legacySnapshot(retryUser))
    : null;
  if (!snapshot) {
    const context = await buildSystemPrompt(db, args.course, args.docId);
    const state = {
      page: `/${[args.course, args.docId].filter(Boolean).join("/")}`,
      question_time: new Date(args.createdAt).toISOString(),
      title_required: !args.generatedTitle,
    };
    snapshot = {
      version: 1,
      contextItems: [message("developer", `${JSON.stringify(state)}\n${context.context}`)],
      userItem: message("user", userText(args.questionText, args.quote)),
      currentDocOrder: context.currentDocOrder,
    };
    if (context.outline) snapshot.contextItems.push(message("developer", context.outline));
    if (
      JSON.stringify(snapshotItems(snapshot)).length > args.limits.maxHistoryChars &&
      snapshot.contextItems.length > 1
    )
      snapshot.contextItems.pop();
  }
  const chronological = rows.filter((r) => !retryUser || r.seq < retryUser.seq).reverse();
  const pairs: Array<{ user: Row; assistant: Row }> = [];
  for (let i = 0; i < chronological.length - 1; i++) {
    const user = chronological[i]!,
      assistant = chronological[i + 1]!;
    if (
      user.role === "user" &&
      assistant.role === "assistant" &&
      assistant.seq === user.seq + 1 &&
      assistant.status !== "running"
    ) {
      pairs.push({ user, assistant });
      i++;
    }
  }
  // Build compatibility from the exact prefix before each exchange. A shifted suffix
  // invalidates an old hash and falls back the entire exchange, never a lone item.
  async function build(picked: typeof pairs): Promise<HistoryExchange[]> {
    const exchanges: HistoryExchange[] = [];
    let prefix: CodexInputItem[] = [];
    for (const { user, assistant } of picked) {
      const userItems = snapshotItems(
        decodeSnapshot(user.prompt_context_json) ?? legacySnapshot(user),
      );
      const envelope =
        assistant.status === "done" ? decodeEnvelope(assistant.agent_items_json) : null;
      const p = envelope?.provenance;
      const compatible =
        p &&
        p.provider === args.route.provider &&
        p.model === args.route.model &&
        p.effort === args.route.effort &&
        p.promptVersion === "chat-v4" &&
        p.toolsVersion === "tools-v4" &&
        p.inputPrefixHash === (await sha256Hex(JSON.stringify([...prefix, ...userItems])));
      const outputs = compatible ? envelope!.items : [message("assistant", assistant.content_tex)];
      const items = [...userItems, ...outputs];
      exchanges.push({ logicalMessages: 2, items });
      prefix.push(...items);
    }
    return exchanges;
  }
  // Unloaded envelopes use the same whole visible exchange fallback as incompatible
  // or incomplete replay. Apply the window only after choosing that representation.
  let picked = pairs;
  let exchanges = await build(picked);
  let history = selectHistoryWindow(exchanges, snapshot, args.limits);
  const limitReached = history.limitReached;
  // Dropping an earlier exchange changes opaque compatibility for the remaining ones.
  while (history.trimmed && picked.length) {
    const removed =
      (exchanges.reduce((n, e) => n + e.logicalMessages, 1) - history.logicalMessages) / 2;
    picked = picked.slice(Math.max(1, removed));
    exchanges = await build(picked);
    history = selectHistoryWindow(exchanges, snapshot, args.limits);
  }
  const hadOlder = Number(thread?.max_seq ?? 0) > rows.length;
  history.limitReached ||= limitReached || hadOlder;
  history.trimmed ||= picked.length !== pairs.length || hadOlder;
  const provenance: ReplayProvenance = {
    ...args.route,
    promptVersion: "chat-v4",
    toolsVersion: "tools-v4",
    inputPrefixHash: await sha256Hex(JSON.stringify(history.items)),
  };
  return {
    snapshot,
    history,
    expectedMaxSeq: Number(thread?.max_seq ?? 0),
    expectedContextRevision: Number(thread?.context_revision ?? 0),
    provenance,
  };
}
