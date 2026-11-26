export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export function hourBucketTs(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS;
}
