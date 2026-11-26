import type { TrackedD1 } from "../db";
import { deleteArchivedRuns, listArchivableRuns, type ArchivedRun } from "./archive-repo";
import { writeVerified, type ArchiveStoragePort } from "./storage";
import { MAX_RUN_DAYS, type ArchiveBatchStats } from "./types";

const RUN_DELETE_CHUNK = 40;

/** Archives finished runs older than `cutoff`, one archive object per day; returns how many days were found. */
export async function archiveRuns(
  db: TrackedD1,
  storage: ArchiveStoragePort,
  cutoff: number,
  limit: number,
  stats: ArchiveBatchStats,
): Promise<{ daysFound: number }> {
  const runs = await listArchivableRuns(db, cutoff, limit);
  stats.runsFound = runs.results.length;
  const byDay = new Map<string, ArchivedRun[]>();
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
    for (let i = 0; i < group.length; i += RUN_DELETE_CHUNK) {
      stats.runsDeleted += await deleteArchivedRuns(db, group.slice(i, i + RUN_DELETE_CHUNK));
    }
  }
  return { daysFound: byDay.size };
}
