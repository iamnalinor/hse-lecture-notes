import { archiveRuns } from "./archive/runs";
import type { ArchiveStoragePort } from "./archive/storage";
import { archiveThreads } from "./archive/threads";
import { MAX_RUN_DAYS, type ArchiveBatchStats } from "./archive/types";
import type { TrackedD1 } from "./db";
import { logEvent } from "./logger";

export { r2ToArchiveStorage, type ArchiveStoragePort } from "./archive/storage";
export type { ArchiveBatchStats } from "./archive/types";

const DAY_MS = 86_400_000;

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

  const threadBudget = await archiveThreads(db, storage, cutoff, batchLimit, stats);
  const runLimit = batchLimit * 4;
  const { daysFound } = await archiveRuns(db, storage, cutoff, runLimit, stats);

  // Another batch is worth scheduling only if this one used up a budget while making progress.
  const threadBudgetUsed =
    threadBudget.pagesLeft === 0 && (threadBudget.checkpointAdvanced || stats.threadsDeleted > 0);
  const runBudgetUsed = daysFound > MAX_RUN_DAYS || stats.runsFound === runLimit;
  stats.needsContinuation = threadBudgetUsed || (runBudgetUsed && stats.runsDeleted > 0);
  logEvent("info", "archive_batch_complete", { ...stats, ...db.telemetry.snapshot() });
  return stats;
}
