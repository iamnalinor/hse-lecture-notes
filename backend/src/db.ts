/**
 * Thin D1 wrapper that collects rows_read, rows_written, sql_statements,
 * db_calls and sql_duration_ms from D1Result.meta (including batch calls)
 * without writing any extra rows to D1.
 */

export interface D1TelemetrySnapshot {
  db_calls: number;
  sql_statements: number;
  rows_read: number;
  rows_written: number;
  sql_duration_ms: number;
}

export class DbTelemetry {
  dbCalls = 0;
  sqlStatements = 0;
  rowsRead = 0;
  rowsWritten = 0;
  sqlDurationMs = 0;

  recordMeta(meta: Partial<D1Meta> | undefined, isNewCall: boolean): void {
    if (isNewCall) this.dbCalls += 1;
    this.sqlStatements += 1;
    if (!meta) return;
    if (typeof meta.rows_read === "number") this.rowsRead += meta.rows_read;
    if (typeof meta.rows_written === "number") this.rowsWritten += meta.rows_written;
    if (typeof meta.duration === "number") this.sqlDurationMs += meta.duration;
  }

  snapshot(): D1TelemetrySnapshot {
    return {
      db_calls: this.dbCalls,
      sql_statements: this.sqlStatements,
      rows_read: this.rowsRead,
      rows_written: this.rowsWritten,
      sql_duration_ms: Number(this.sqlDurationMs.toFixed(2)),
    };
  }
}

export class TrackedD1 {
  readonly raw: D1Database;
  readonly telemetry: DbTelemetry;

  constructor(db: D1Database, telemetry = new DbTelemetry()) {
    this.raw = db;
    this.telemetry = telemetry;
  }

  prepare(query: string): D1PreparedStatement {
    return this.raw.prepare(query);
  }

  async first<T = Record<string, unknown>>(stmt: D1PreparedStatement): Promise<T | null> {
    const res = await stmt.all<T>();
    this.telemetry.recordMeta(res.meta, true);
    return res.results[0] ?? null;
  }

  async all<T = Record<string, unknown>>(stmt: D1PreparedStatement): Promise<D1Result<T>> {
    const res = await stmt.all<T>();
    this.telemetry.recordMeta(res.meta, true);
    return res;
  }

  async run(stmt: D1PreparedStatement): Promise<D1Result<Record<string, unknown>>> {
    const res = await stmt.run();
    this.telemetry.recordMeta(res.meta, true);
    return res;
  }

  async batch<T = Record<string, unknown>>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (stmts.length === 0) return [];
    const results = await this.raw.batch<T>(stmts);
    results.forEach((res, idx) => {
      this.telemetry.recordMeta(res.meta, idx === 0);
    });
    return results;
  }
}
