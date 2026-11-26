import type { TrackedD1 } from "../db";
import { PAGE_BYTES, PAGE_ROWS } from "./types";

/** SQL of the archiver over `chat_threads`, `chat_messages`, `usage_runs` and `archive_thread_progress`. */

export interface ThreadSnapshot {
  id: string;
  title: string;
  generated_title: string | null;
  context_limited: number;
  context_revision: number;
  browser_id: string | null;
  telegram_id: number | null;
  created_at: number;
  updated_at: number;
}

/** A thread old enough to archive, with where a previous partial archive of the same snapshot stopped. */
export interface ThreadCandidate extends ThreadSnapshot {
  max_seq: number | null;
  last_seq: number | null;
  last_part_key: string | null;
}

export type ArchivedRun = Record<string, unknown> & {
  id: string;
  created_at: number;
  updated_at: number;
};

/** What a thread must still look like when its rows are deleted: id, updated_at, revision, last seq. */
export type ThreadFingerprint = [string, number, number, number | null];

const unchangedThread = `id = ? AND updated_at = ? AND context_revision = ?
  AND (SELECT MAX(seq) FROM chat_messages WHERE thread_id = chat_threads.id) IS ?
  AND NOT EXISTS (SELECT 1 FROM usage_runs WHERE thread_id = chat_threads.id AND status = 'running')`;

export function listThreadCandidates(
  db: TrackedD1,
  cutoff: number,
  limit: number,
): Promise<D1Result<ThreadCandidate>> {
  return db.all<ThreadCandidate>(
    db
      .prepare(`WITH candidates AS MATERIALIZED (
      SELECT id, COALESCE(generated_title,title) AS title, generated_title, context_limited, context_revision,
             browser_id, telegram_id, created_at, updated_at,
             (SELECT MAX(seq) FROM chat_messages WHERE thread_id = chat_threads.id) AS max_seq
      FROM chat_threads WHERE updated_at < ?
        AND NOT EXISTS (SELECT 1 FROM usage_runs WHERE thread_id = chat_threads.id AND status = 'running')
      ORDER BY updated_at,id LIMIT ?
    )
    SELECT c.*,p.last_seq,p.last_part_key FROM candidates c LEFT JOIN archive_thread_progress p
      ON p.thread_id = c.id AND p.snapshot_updated_at = c.updated_at AND p.snapshot_revision = c.context_revision AND p.max_seq = c.max_seq
    ORDER BY c.updated_at,c.id`)
      .bind(cutoff, limit),
  );
}

export async function readMessagePage(
  db: TrackedD1,
  threadId: string,
  afterSeq: number | null,
  maxSeq: number,
) {
  // Inspect sizes before copying payloads into the Worker. A single large row
  // is a page of its own, bounded by D1's row limit.
  const size = [
    "content_tex",
    "quote_json",
    "steps_json",
    "agent_items_json",
    "prompt_context_json",
    "error_message",
    "suggestion",
  ]
    .map((column) => `coalesce(length(CAST(${column} AS BLOB)),0)`)
    .join(" + ");
  const after = afterSeq === null ? "" : "AND seq > ?";
  const page = await db.all<Record<string, unknown> & { seq: number }>(
    db
      .prepare(`
    WITH candidates AS MATERIALIZED (
      SELECT seq, ${size} AS bytes FROM chat_messages WHERE thread_id = ? ${after} AND seq <= ?
      ORDER BY seq LIMIT ?
    ), sizes AS (
      SELECT seq, sum(bytes) OVER (ORDER BY seq) AS total, row_number() OVER (ORDER BY seq) AS n FROM candidates
    )
    SELECT m.id,m.seq,m.role,m.status,m.course,m.doc_id,m.content_tex,m.quote_json,m.steps_json,
           m.error_message,m.agent_items_json,m.prompt_context_json,m.suggestion,m.run_id,m.created_at,m.updated_at
    FROM sizes JOIN chat_messages m ON m.thread_id = ? AND m.seq = sizes.seq
    WHERE sizes.n = 1 OR sizes.total <= ? ORDER BY m.seq
  `)
      .bind(
        threadId,
        ...(afterSeq === null ? [] : [afterSeq]),
        maxSeq,
        PAGE_ROWS,
        threadId,
        PAGE_BYTES,
      ),
  );
  return page.results;
}

/** Deletes the thread (its messages cascade) only if it is still exactly the archived snapshot. */
export function deleteThreadIfUnchanged(
  db: TrackedD1,
  fingerprint: ThreadFingerprint,
): Promise<D1Result<Record<string, unknown>>> {
  return db.run(
    db.prepare(`DELETE FROM chat_threads WHERE ${unchangedThread}`).bind(...fingerprint),
  );
}

/** Records how far a long thread has been archived, while the thread is unchanged. */
export function saveThreadProgress(
  db: TrackedD1,
  progress: { maxSeq: number | null; lastSeq: number; partKey: string },
  fingerprint: ThreadFingerprint,
): Promise<D1Result<Record<string, unknown>>> {
  return db.run(
    db
      .prepare(`
        INSERT INTO archive_thread_progress(thread_id,snapshot_updated_at,snapshot_revision,max_seq,last_seq,last_part_key)
        SELECT id,updated_at,context_revision,?,?,? FROM chat_threads WHERE ${unchangedThread}
        ON CONFLICT(thread_id) DO UPDATE SET snapshot_updated_at=excluded.snapshot_updated_at,
          snapshot_revision=excluded.snapshot_revision,max_seq=excluded.max_seq,
          last_seq=excluded.last_seq,last_part_key=excluded.last_part_key
        WHERE snapshot_updated_at != excluded.snapshot_updated_at OR snapshot_revision != excluded.snapshot_revision
          OR max_seq != excluded.max_seq OR last_seq < excluded.last_seq`)
      .bind(progress.maxSeq, progress.lastSeq, progress.partKey, ...fingerprint),
  );
}

export function listArchivableRuns(
  db: TrackedD1,
  cutoff: number,
  limit: number,
): Promise<D1Result<ArchivedRun>> {
  return db.all<ArchivedRun>(
    db
      .prepare(
        `SELECT * FROM usage_runs WHERE created_at < ? AND status != 'running' ORDER BY created_at,id LIMIT ?`,
      )
      .bind(cutoff, limit),
  );
}

/** Deletes archived runs that have not changed since they were read; returns how many went. */
export async function deleteArchivedRuns(db: TrackedD1, runs: ArchivedRun[]): Promise<number> {
  const pairs = runs.map(() => "(?,?)").join(",");
  const deleted = await db.run(
    db
      .prepare(`DELETE FROM usage_runs
        WHERE (id,updated_at) IN (VALUES ${pairs}) AND status != 'running'`)
      .bind(...runs.flatMap((run) => [run.id, run.updated_at])),
  );
  return deleted.meta.changes;
}
