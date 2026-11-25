import type { TrackedD1 } from "./db";
import { logEvent } from "./logger";

const DAY_MS = 86_400_000;

export interface ArchiveStoragePort {
  head(key: string): Promise<boolean>;
  putIfAbsent(key: string, body: Uint8Array): Promise<boolean>;
  getBytes(key: string): Promise<Uint8Array | null>;
}

export function r2ToArchiveStorage(bucket: R2Bucket): ArchiveStoragePort {
  return {
    async head(key) {
      return (await bucket.head(key)) !== null;
    },
    async putIfAbsent(key, body) {
      const existing = await bucket.head(key);
      if (existing !== null) return false;
      await bucket.put(key, body, {
        httpMetadata: { contentType: "application/gzip" },
      });
      return true;
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
  noncesCleaned: number;
  sessionsCleaned: number;
}

/**
 * Runs inside the SQLite-backed Durable Object (30 s CPU budget) when invoked by the daily Cron.
 * Never deletes threads unless their gzip archive has been written and hash-verified in `storage`.
 */
export async function runArchiveBatch(
  db: TrackedD1,
  storage: ArchiveStoragePort | null,
  options: { archiveAfterDays?: number; batchLimit?: number; nowMs?: number } = {},
): Promise<ArchiveBatchStats> {
  const now = options.nowMs ?? Date.now();
  const archiveAfterDays = options.archiveAfterDays ?? 30;
  const batchLimit = options.batchLimit ?? 50;
  const cutoff = now - archiveAfterDays * DAY_MS;

  const stats: ArchiveBatchStats = {
    threadsFound: 0,
    threadsDeleted: 0,
    threadsSkippedRace: 0,
    runsFound: 0,
    runsDeleted: 0,
    archivesWritten: 0,
    noncesCleaned: 0,
    sessionsCleaned: 0,
  };

  // Always prune expired nonces & expired sessions in bounded chunks
  const [nonceRes, sessRes] = await db.batch([
    db
      .prepare(
        "DELETE FROM auth_nonces WHERE rowid IN (SELECT rowid FROM auth_nonces WHERE expires_at < ? LIMIT 200)",
      )
      .bind(now),
    db
      .prepare(
        "DELETE FROM user_sessions WHERE rowid IN (SELECT rowid FROM user_sessions WHERE expires_at < ? LIMIT 200)",
      )
      .bind(now),
  ]);
  stats.noncesCleaned = nonceRes?.meta?.changes ?? 0;
  stats.sessionsCleaned = sessRes?.meta?.changes ?? 0;

  if (!storage) {
    logEvent("warn", "archive_skipped_no_bucket", { ...stats });
    return stats;
  }

  // Find inactive threads across all days older than cutoff
  const threadsRes = await db.all<{
    id: string;
    title: string;
    browser_id: string | null;
    telegram_id: number | null;
    created_at: number;
    updated_at: number;
  }>(
    db
      .prepare(
        `SELECT id, COALESCE(generated_title, title) AS title, generated_title, context_limited, context_revision, browser_id, telegram_id, created_at, updated_at
         FROM chat_threads
         WHERE updated_at < ?
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .bind(cutoff, batchLimit),
  );
  stats.threadsFound = threadsRes.results.length;

  const runsRes = await db.all<Record<string, unknown>>(
    db
      .prepare(
        `SELECT * FROM usage_runs
         WHERE created_at < ? AND status != 'running'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(cutoff, batchLimit * 4),
  );
  stats.runsFound = runsRes.results.length;

  const byDay = new Map<string, Array<Record<string, unknown>>>();

  const messages = new Map<string, Record<string, unknown>[]>();
  for (let i = 0; i < threadsRes.results.length; i += 50) {
    const ids = threadsRes.results.slice(i, i + 50).map((thread) => thread.id);
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.all<Record<string, unknown> & { thread_id: string }>(
      db.prepare(`SELECT thread_id, id, seq, role, status, course, doc_id, content_tex, quote_json, steps_json,
                         error_message, agent_items_json, prompt_context_json, suggestion, run_id, created_at, updated_at
                  FROM chat_messages WHERE thread_id IN (${placeholders}) ORDER BY thread_id, seq`).bind(...ids),
    );
    for (const { thread_id, ...message } of result.results) {
      const list = messages.get(thread_id) ?? [];
      list.push(message);
      messages.set(thread_id, list);
    }
  }
  for (const thr of threadsRes.results) {
    const dayStr = new Date(thr.updated_at).toISOString().slice(0, 10);
    const bucket = byDay.get(dayStr) ?? [];
    bucket.push({ kind: "thread", thread: thr, messages: messages.get(thr.id) ?? [] });
    byDay.set(dayStr, bucket);
  }

  for (const run of runsRes.results) {
    const createdAt = typeof run.created_at === "number" ? run.created_at : now;
    const dayStr = new Date(createdAt).toISOString().slice(0, 10);
    const bucket = byDay.get(dayStr) ?? [];
    bucket.push({ kind: "usage_run", run });
    byDay.set(dayStr, bucket);
  }

  const encoder = new TextEncoder();
  // Each day requires up to three R2 calls plus two guarded D1 deletes.
  // Leave later days in D1 for the next batch.
  for (const dayStr of [...byDay.keys()].sort().slice(0, 6)) {
    const records = byDay.get(dayStr)!;
    const jsonl = `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
    const gz = await gzipBytes(encoder.encode(jsonl));
    const digest = await sha256HexBytes(gz);
    const key = `archives/${dayStr}/${digest}.jsonl.gz`;

    await storage.putIfAbsent(key, gz);
    const readBack = await storage.getBytes(key);
    if (!readBack || (await sha256HexBytes(readBack)) !== digest) {
      throw new Error(`Archive checksum verification failed for ${key}`);
    }
    stats.archivesWritten += 1;

    const threads = records
      .filter((record) => record.kind === "thread")
      .map((record) => record.thread as { id: string; updated_at: number });
    for (let i = 0; i < threads.length; i += 40) {
      const chunk = threads.slice(i, i + 40);
      const pairs = chunk.map(() => "(?, ?)").join(",");
      const deleted = await db.all<{ id: string }>(db.prepare(
        `DELETE FROM chat_threads WHERE (id, updated_at) IN (VALUES ${pairs})
         AND NOT EXISTS (SELECT 1 FROM usage_runs WHERE thread_id = chat_threads.id AND status = 'running') RETURNING id`,
      ).bind(...chunk.flatMap((thread) => [thread.id, thread.updated_at])));
      stats.threadsDeleted += deleted.results.length;
      stats.threadsSkippedRace += chunk.length - deleted.results.length;
    }
    const runs = records
      .filter((record) => record.kind === "usage_run")
      .map((record) => (record.run as { id: string }).id);
    for (let i = 0; i < runs.length; i += 80) {
      const chunk = runs.slice(i, i + 80);
      const deleted = await db.all<{ id: string }>(db.prepare(
        `DELETE FROM usage_runs WHERE id IN (${chunk.map(() => "?").join(",")}) AND status != 'running' RETURNING id`,
      ).bind(...chunk));
      stats.runsDeleted += deleted.results.length;
    }
  }

  logEvent("info", "archive_batch_complete", { ...stats, ...db.telemetry.snapshot() });
  return stats;
}
