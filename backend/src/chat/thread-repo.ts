import { RUN_ADMITTED, type SqlGuard } from "../admission-sql";
import type { TrackedD1 } from "../db";
import type { MessageStatus } from "../types";
import { firstQuestionSql } from "./thread-title";

/**
 * SQL for the writes that the run lifecycle makes to `chat_threads` and `chat_messages`:
 * admission (create or touch the thread, add the question and the placeholder answer, retry),
 * finalization, and publishing the model topic. Reads for building the prompt live in `history.ts`.
 *
 * Statements that take a `RUN_ADMITTED`-style guard are conditional on the run row existing, so a
 * refused admission leaves no thread or message behind.
 */

export interface ThreadRow {
  id: string;
  generated_title: string | null;
  first_question: string | null;
  context_limited: number;
  context_revision: number;
  browser_id: string | null;
  telegram_id: number | null;
}

export interface RetryTargetRow {
  id: string;
  seq: number;
  user_id: string;
  course: string;
  doc_id: string;
  content_tex: string;
  quote_json: string | null;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Reads for admission
// ---------------------------------------------------------------------------

export function selectThreadStatement(db: TrackedD1, threadId: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT id, generated_title, ${firstQuestionSql} AS first_question, context_limited, context_revision, browser_id, telegram_id FROM chat_threads WHERE id = ?`,
    )
    .bind(threadId);
}

export function selectMaxSeqStatement(db: TrackedD1, threadId: string): D1PreparedStatement {
  return db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_messages WHERE thread_id = ?")
    .bind(threadId);
}

export function readThread(db: TrackedD1, threadId: string): Promise<ThreadRow | null> {
  return db.first<ThreadRow>(selectThreadStatement(db, threadId));
}

/** A thread belongs to the guest browser that created it, or to the signed-in account. */
export function threadBelongsTo(
  thread: ThreadRow | null | undefined,
  owner: { isGuest: boolean; browserId: string; telegramId: number | null },
): thread is ThreadRow {
  return Boolean(
    thread &&
      (owner.isGuest
        ? thread.browser_id === owner.browserId && thread.telegram_id === null
        : thread.telegram_id === owner.telegramId),
  );
}

/** The user message and its answer, found by the answer's id; only the latest exchange qualifies. */
export function readRetryTarget(
  db: TrackedD1,
  threadId: string,
  assistantMessageId: string,
): Promise<RetryTargetRow | null> {
  return db.first<RetryTargetRow>(
    db
      .prepare(`SELECT assistant.id, assistant.seq, user.id AS user_id, user.created_at,
          user.course, user.doc_id, user.content_tex, user.quote_json
        FROM chat_messages AS assistant JOIN chat_messages AS user
          ON user.thread_id = assistant.thread_id AND user.seq = assistant.seq - 1 AND user.role = 'user'
        WHERE assistant.thread_id = ? AND assistant.id = ? AND assistant.role = 'assistant'`)
      .bind(threadId, assistantMessageId),
  );
}

// ---------------------------------------------------------------------------
// Admission guards (parts of the run insert, see quotas/usage-repo.ts)
// ---------------------------------------------------------------------------

/** The caller owns the thread. A new thread needs no check. */
export function threadOwnerGuard(
  creatingThread: boolean,
  isGuest: boolean,
  threadId: string,
  browserId: string,
  telegramId: number | null,
): SqlGuard {
  if (creatingThread) return { sql: "1", bindings: [] };
  return {
    sql: `EXISTS (
    SELECT 1 FROM chat_threads WHERE id = ?
      AND ${isGuest ? "telegram_id IS NULL AND browser_id = ?" : "telegram_id = ?"})`,
    bindings: [threadId, isGuest ? browserId : telegramId],
  };
}

/** The thread has the history revision and last message the prompt context was built from. */
export function threadContextGuard(
  creatingThread: boolean,
  threadId: string,
  expectedContextRevision: number,
  expectedMaxSeq: number,
): SqlGuard {
  if (creatingThread) return { sql: "1", bindings: [] };
  return {
    sql: `EXISTS (SELECT 1 FROM chat_threads WHERE id = ? AND context_revision = ?
    AND ? = (SELECT COALESCE(MAX(seq),0) FROM chat_messages WHERE thread_id = ?))`,
    bindings: [threadId, expectedContextRevision, expectedMaxSeq, threadId],
  };
}

// ---------------------------------------------------------------------------
// Admission writes
// ---------------------------------------------------------------------------

export function createThreadStatement(
  db: TrackedD1,
  args: {
    threadId: string;
    browserId: string | null;
    telegramId: number | null;
    nowMs: number;
    contextLimited: boolean;
    runId: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO chat_threads (id, title, browser_id, telegram_id, created_at, updated_at, context_limited, context_revision)
           SELECT ?, '', ?, ?, ?, ?, ?, 1 WHERE ${RUN_ADMITTED}`,
    )
    .bind(
      args.threadId,
      args.browserId,
      args.telegramId,
      args.nowMs,
      args.nowMs,
      args.contextLimited ? 1 : 0,
      args.runId,
    );
}

export function touchThreadForRunStatement(
  db: TrackedD1,
  args: { threadId: string; nowMs: number; contextLimited: boolean; runId: string },
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE chat_threads SET updated_at = ?, context_revision = context_revision + 1, context_limited = MAX(context_limited, ?) WHERE id = ? AND ${RUN_ADMITTED}`,
    )
    .bind(args.nowMs, args.contextLimited ? 1 : 0, args.threadId, args.runId);
}

/** Retry: the same answer row starts over under the new run. */
export function resetAssistantForRetryStatement(
  db: TrackedD1,
  args: { runId: string; nowMs: number; assistantMessageId: string },
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE chat_messages
           SET status = 'running', content_tex = '', steps_json = NULL, agent_items_json = NULL, suggestion = NULL, error_message = NULL, run_id = ?, updated_at = ?
           WHERE id = ? AND ${RUN_ADMITTED}`,
    )
    .bind(args.runId, args.nowMs, args.assistantMessageId, args.runId);
}

export function insertUserMessageStatement(
  db: TrackedD1,
  args: {
    messageId: string;
    threadId: string;
    course: string;
    docId: string;
    seq: number;
    contentTex: string;
    quoteJson: string | null;
    runId: string;
    nowMs: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO chat_messages (id, thread_id, course, doc_id, seq, role, status, content_tex, quote_json, run_id, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, 'user', 'done', ?, ?, ?, ?, ? WHERE ${RUN_ADMITTED}`,
    )
    .bind(
      args.messageId,
      args.threadId,
      args.course,
      args.docId,
      args.seq,
      args.contentTex,
      args.quoteJson,
      args.runId,
      args.nowMs,
      args.nowMs,
      args.runId,
    );
}

export function insertAssistantPlaceholderStatement(
  db: TrackedD1,
  args: {
    messageId: string;
    threadId: string;
    course: string;
    docId: string;
    seq: number;
    runId: string;
    nowMs: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO chat_messages (id, thread_id, course, doc_id, seq, role, status, content_tex, run_id, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, 'assistant', 'running', '', ?, ?, ? WHERE ${RUN_ADMITTED}`,
    )
    .bind(
      args.messageId,
      args.threadId,
      args.course,
      args.docId,
      args.seq,
      args.runId,
      args.nowMs,
      args.nowMs,
      args.runId,
    );
}

export function savePromptContextStatement(
  db: TrackedD1,
  args: { userMessageId: string; snapshotJson: string; runId: string },
): D1PreparedStatement {
  return db
    .prepare(`UPDATE chat_messages SET prompt_context_json = ? WHERE id = ? AND ${RUN_ADMITTED}`)
    .bind(args.snapshotJson, args.userMessageId, args.runId);
}

// ---------------------------------------------------------------------------
// Finalization (both statements read the still-running run row, see quotas/finalize.ts)
// ---------------------------------------------------------------------------

export function finishAssistantMessageStatement(
  db: TrackedD1,
  running: { condition: string; bindings: (number | string)[] },
  args: {
    status: MessageStatus;
    contentTex: string | null;
    stepsJson: string | null;
    agentItemsJson: string | null;
    suggestion: string | null;
    errorMessage: string | null;
    nowMs: number;
  },
): D1PreparedStatement {
  return db
    .prepare(`UPDATE chat_messages SET status = ?, content_tex = COALESCE(?, content_tex),
      steps_json = COALESCE(?, steps_json), agent_items_json = COALESCE(?, agent_items_json),
      suggestion = ?, error_message = ?, updated_at = ? WHERE id = (SELECT assistant_message_id FROM usage_runs WHERE ${running.condition})`)
    .bind(
      args.status,
      args.contentTex,
      args.stepsJson,
      args.agentItemsJson,
      args.suggestion,
      args.errorMessage,
      args.nowMs,
      ...running.bindings,
    );
}

export function touchThreadOnFinishStatement(
  db: TrackedD1,
  running: { condition: string; bindings: (number | string)[] },
  nowMs: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE chat_threads SET updated_at = ?, context_revision = context_revision + 1 WHERE id = (SELECT thread_id FROM usage_runs WHERE ${running.condition})`,
    )
    .bind(nowMs, ...running.bindings);
}

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

/** Publish a model topic only while the owning run is still active. */
export async function persistRunTopic(
  db: TrackedD1,
  runId: string,
  title: string,
): Promise<boolean> {
  const result = await db.run(
    db
      .prepare(`UPDATE chat_threads
    SET generated_title=?, updated_at=?, context_revision=context_revision+1
    WHERE id=(SELECT thread_id FROM usage_runs WHERE id=? AND status='running')`)
      .bind(title, Date.now(), runId),
  );
  return Number(result.meta.changes ?? 0) > 0;
}
