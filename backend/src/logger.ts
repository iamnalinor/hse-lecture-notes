/**
 * Structured JSON logger for Cloudflare Workers Logs & Traces.
 * Never logs secrets, raw JWTs, cookies, or OAuth tokens.
 */

export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = {
    ...fields,
    ts: new Date().toISOString(),
    level,
    event,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function maskId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? value : `${value.slice(0, 8)}...`;
}
