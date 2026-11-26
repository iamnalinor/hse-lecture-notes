import type { TrackedD1 } from "../db";
import {
  deleteThreadIfUnchanged,
  listThreadCandidates,
  readMessagePage,
  saveThreadProgress,
  type ThreadCandidate,
  type ThreadFingerprint,
} from "./archive-repo";
import { writeVerified, type ArchiveStoragePort } from "./storage";
import { MAX_THREAD_PAGES, type ArchiveBatchStats } from "./types";

/** What one batch has left to spend on threads, and whether it made progress worth continuing. */
interface ThreadBudget {
  pagesLeft: number;
  checkpointAdvanced: boolean;
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Archives one thread page by page, spending the batch's page budget. A thread that fits is
 * written whole and deleted; a longer one is written in parts with a saved checkpoint, so the next
 * batch resumes where this one stopped. Any change to the thread in between makes it skipped.
 */
async function archiveThread(
  db: TrackedD1,
  storage: ArchiveStoragePort,
  candidate: ThreadCandidate,
  budget: ThreadBudget,
  stats: ArchiveBatchStats,
): Promise<void> {
  const { max_seq, last_seq, last_part_key, ...thread } = candidate;
  const day = dayOf(thread.updated_at);
  const fingerprint: ThreadFingerprint = [
    thread.id,
    thread.updated_at,
    thread.context_revision,
    max_seq,
  ];
  let cursor = last_seq;
  let previousPart = last_part_key;
  while (budget.pagesLeft > 0) {
    budget.pagesLeft--;
    const messages = max_seq === null ? [] : await readMessagePage(db, thread.id, cursor, max_seq);
    const last = messages.at(-1)?.seq;
    if (max_seq === null || last === max_seq) {
      const record = previousPart
        ? { kind: "thread_manifest", thread, previousPart, messages }
        : { kind: "thread", thread, messages };
      await writeVerified(storage, `archives/${day}`, [record]);
      stats.archivesWritten++;
      const deleted = await deleteThreadIfUnchanged(db, fingerprint);
      if (deleted.meta.changes) stats.threadsDeleted++;
      else stats.threadsSkippedRace++;
      return;
    }
    if (last === undefined) {
      stats.threadsSkippedRace++;
      return;
    }
    const key = await writeVerified(storage, `archive-parts/${day}`, [
      { kind: "thread_part", threadId: thread.id, previousPart, messages },
    ]);
    stats.archivesWritten++;
    const saved = await saveThreadProgress(
      db,
      { maxSeq: max_seq, lastSeq: last, partKey: key },
      fingerprint,
    );
    if (!saved.meta.changes) {
      stats.threadsSkippedRace++;
      return;
    }
    budget.checkpointAdvanced = true;
    cursor = last;
    previousPart = key;
  }
}

/** Archives the threads idle since `cutoff`; returns the budget state for the continuation decision. */
export async function archiveThreads(
  db: TrackedD1,
  storage: ArchiveStoragePort,
  cutoff: number,
  batchLimit: number,
  stats: ArchiveBatchStats,
): Promise<ThreadBudget> {
  const threads = await listThreadCandidates(db, cutoff, Math.min(batchLimit, MAX_THREAD_PAGES));
  stats.threadsFound = threads.results.length;
  const budget: ThreadBudget = { pagesLeft: MAX_THREAD_PAGES, checkpointAdvanced: false };
  for (const candidate of threads.results) {
    await archiveThread(db, storage, candidate, budget, stats);
    if (!budget.pagesLeft) break;
  }
  return budget;
}
