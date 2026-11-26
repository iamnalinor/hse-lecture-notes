import type { TrackedD1 } from "./db";
import { logEvent } from "./logger";

const DAY_MS = 86_400_000;

export interface ArchiveStoragePort {
  putIfAbsent(key: string, body: Uint8Array): Promise<boolean>;
  getBytes(key: string): Promise<Uint8Array | null>;
}

export function r2ToArchiveStorage(bucket: R2Bucket): ArchiveStoragePort {
  return {
    async putIfAbsent(key, body) {
      return (
        (await bucket.put(key, body, {
          onlyIf: new Headers({ "If-None-Match": "*" }),
          httpMetadata: { contentType: "application/gzip" },
        })) !== null
      );
    },
    async getBytes(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return new Uint8Array(await obj.arrayBuffer());
    },
  };
}

async function gzipBytes(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(raw).then(() => writer.close());
  const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  await writePromise;
  return out;
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i += 1) {
    hex += arr[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export interface ArchiveBatchStats {
  threadsFound: number;
  threadsDeleted: number;
  threadsSkippedRace: number;
  runsFound: number;
  runsDeleted: number;
  archivesWritten: number;
  needsContinuation: boolean;
}

// Keep D1 results, compressed objects and subrequests bounded independently of chat length.
const PAGE_ROWS = 16;
const PAGE_BYTES = 256 * 1024;
const MAX_THREAD_PAGES = 6;
const MAX_RUN_DAYS = 6;

interface ThreadSnapshot {
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

async function writeVerified(
  storage: ArchiveStoragePort,
  directory: string,
  records: unknown[],
): Promise<string> {
  const raw = new TextEncoder().encode(
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  const compressed = await gzipBytes(raw);
  const digest = await sha256HexBytes(compressed);
  const key = `${directory}/${digest}.jsonl.gz`;
  await storage.putIfAbsent(key, compressed);
  const copy = await storage.getBytes(key);
  if (!copy || (await sha256HexBytes(copy)) !== digest) {
    throw new Error(`Archive checksum verification failed for ${key}`);
  }
  return key;
}

async function readMessagePage(
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

const unchangedThread = `id = ? AND updated_at = ? AND context_revision = ?
  AND (SELECT MAX(seq) FROM chat_messages WHERE thread_id = chat_threads.id) IS ?
  AND NOT EXISTS (SELECT 1 FROM usage_runs WHERE thread_id = chat_threads.id AND status = 'running')`;

/** Daily cron entrypoint on the SQLite-backed Durable Object. */
export async function runArchiveBatch(
  db: TrackedD1,
  storage: ArchiveStoragePort | null,
  options: { archiveAfterDays?: number; batchLimit?: number; nowMs?: number } = {},
): Promise<ArchiveBatchStats> {
  const now = options.nowMs ?? Date.now();
  const cutoff = now - Math.max(options.archiveAfterDays ?? 30, 1) * DAY_MS;
  const batchLimit = Math.min(50, Math.max(0, options.batchLimit ?? 50));
  const stats: ArchiveBatchStats = {
    threadsFound: 0,
    threadsDeleted: 0,
    threadsSkippedRace: 0,
    runsFound: 0,
    runsDeleted: 0,
    archivesWritten: 0,
    needsContinuation: false,
  };
  if (!storage) {
    logEvent("warn", "archive_skipped_no_bucket", { ...stats });
    return stats;
  }

  const threads = await db.all<
    ThreadSnapshot & {
      max_seq: number | null;
      last_seq: number | null;
      last_part_key: string | null;
    }
  >(
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
      .bind(cutoff, Math.min(batchLimit, MAX_THREAD_PAGES)),
  );
  stats.threadsFound = threads.results.length;
  let pagesLeft = MAX_THREAD_PAGES;
  let checkpointAdvanced = false;
  for (const { max_seq, last_seq, last_part_key, ...thread } of threads.results) {
    const day = new Date(thread.updated_at).toISOString().slice(0, 10);
    const snapshot = [thread.id, thread.updated_at, thread.context_revision, max_seq];
    let cursor = last_seq;
    let previousPart = last_part_key;
    while (pagesLeft > 0) {
      pagesLeft--;
      const messages =
        max_seq === null ? [] : await readMessagePage(db, thread.id, cursor, max_seq);
      const last = messages.at(-1)?.seq;
      if (max_seq === null || last === max_seq) {
        const record = previousPart
          ? { kind: "thread_manifest", thread, previousPart, messages }
          : { kind: "thread", thread, messages };
        await writeVerified(storage, `archives/${day}`, [record]);
        stats.archivesWritten++;
        const deleted = await db.run(
          db.prepare(`DELETE FROM chat_threads WHERE ${unchangedThread}`).bind(...snapshot),
        );
        if (deleted.meta.changes) stats.threadsDeleted++;
        else stats.threadsSkippedRace++;
        break;
      }
      if (last === undefined) {
        stats.threadsSkippedRace++;
        break;
      }
      const key = await writeVerified(storage, `archive-parts/${day}`, [
        { kind: "thread_part", threadId: thread.id, previousPart, messages },
      ]);
      stats.archivesWritten++;
      const saved = await db.run(
        db
          .prepare(`
        INSERT INTO archive_thread_progress(thread_id,snapshot_updated_at,snapshot_revision,max_seq,last_seq,last_part_key)
        SELECT id,updated_at,context_revision,?,?,? FROM chat_threads WHERE ${unchangedThread}
        ON CONFLICT(thread_id) DO UPDATE SET snapshot_updated_at=excluded.snapshot_updated_at,
          snapshot_revision=excluded.snapshot_revision,max_seq=excluded.max_seq,
          last_seq=excluded.last_seq,last_part_key=excluded.last_part_key
        WHERE snapshot_updated_at != excluded.snapshot_updated_at OR snapshot_revision != excluded.snapshot_revision
          OR max_seq != excluded.max_seq OR last_seq < excluded.last_seq`)
          .bind(max_seq, last, key, ...snapshot),
      );
      if (!saved.meta.changes) {
        stats.threadsSkippedRace++;
        break;
      }
      checkpointAdvanced = true;
      cursor = last;
      previousPart = key;
    }
    if (!pagesLeft) break;
  }

  const runs = await db.all<
    Record<string, unknown> & { id: string; created_at: number; updated_at: number }
  >(
    db
      .prepare(
        `SELECT * FROM usage_runs WHERE created_at < ? AND status != 'running' ORDER BY created_at,id LIMIT ?`,
      )
      .bind(cutoff, batchLimit * 4),
  );
  stats.runsFound = runs.results.length;
  const byDay = new Map<string, typeof runs.results>();
  for (const run of runs.results) {
    const day = new Date(run.created_at).toISOString().slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(run);
    byDay.set(day, group);
  }
  for (const [day, group] of [...byDay].slice(0, MAX_RUN_DAYS)) {
    await writeVerified(
      storage,
      `archives/${day}`,
      group.map((run) => ({ kind: "usage_run", run })),
    );
    stats.archivesWritten++;
    for (let i = 0; i < group.length; i += 40) {
      const chunk = group.slice(i, i + 40);
      const pairs = chunk.map(() => "(?,?)").join(",");
      const deleted = await db.run(
        db
          .prepare(`DELETE FROM usage_runs
        WHERE (id,updated_at) IN (VALUES ${pairs}) AND status != 'running'`)
          .bind(...chunk.flatMap((run) => [run.id, run.updated_at])),
      );
      stats.runsDeleted += deleted.meta.changes;
    }
  }
  const threadBudgetUsed = pagesLeft === 0 && (checkpointAdvanced || stats.threadsDeleted > 0);
  const runBudgetUsed = byDay.size > MAX_RUN_DAYS || stats.runsFound === batchLimit * 4;
  stats.needsContinuation = threadBudgetUsed || (runBudgetUsed && stats.runsDeleted > 0);
  logEvent("info", "archive_batch_complete", { ...stats, ...db.telemetry.snapshot() });
  return stats;
}
