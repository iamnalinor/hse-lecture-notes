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
export const PAGE_ROWS = 16;
export const PAGE_BYTES = 256 * 1024;
export const MAX_THREAD_PAGES = 6;
export const MAX_RUN_DAYS = 6;
