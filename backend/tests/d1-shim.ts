import initialPolicy from "../policy.json";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Faithful in-memory SQLite shim for Cloudflare D1Database using bun:sqlite.
 * Executes real SQLite + FTS5 + partial unique indexes + transactions (`batch`).
 */
export class SqliteD1Shim {
  readonly sqlite: Database;

  constructor(applyInitMigration = true) {
    this.sqlite = new Database(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    if (applyInitMigration) {
      const dir = resolve(import.meta.dir, "../migrations");
      for (const name of readdirSync(dir).filter(name => name.endsWith(".sql")).sort()) {
        this.sqlite.exec(readFileSync(resolve(dir, name), "utf8"));
      }
      this.sqlite.query("INSERT INTO service_config (key, value_json, updated_at) VALUES ('policy', ?, 0)").run(JSON.stringify(initialPolicy));
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new SqlitePreparedStatement(this.sqlite, query, []) as unknown as D1PreparedStatement;
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    const tx = this.sqlite.transaction(() => {
      for (const stmt of statements) {
        const s = stmt as unknown as SqlitePreparedStatement;
        results.push(s.executeSync<T>());
      }
    });
    tx();
    return results;
  }

  explainQueryPlan(query: string, ...params: unknown[]): string[] {
    const rows = this.sqlite
      .query(`EXPLAIN QUERY PLAN ${query}`)
      .all(...(params as never[])) as Array<{ detail: string }>;
    return rows.map((r) => r.detail);
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

class SqlitePreparedStatement {
  private readonly sqlite: Database;
  private readonly query: string;
  private readonly params: unknown[];

  constructor(sqlite: Database, query: string, params: unknown[]) {
    this.sqlite = sqlite;
    this.query = query;
    this.params = params;
  }

  bind(...values: unknown[]): SqlitePreparedStatement {
    return new SqlitePreparedStatement(this.sqlite, this.query, values);
  }

  executeSync<T = Record<string, unknown>>(): D1Result<T> {
    const start = performance.now();
    const trimmed = this.query.trim().toUpperCase();
    const isSelect =
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("EXPLAIN") ||
      trimmed.startsWith("PRAGMA");

    const returnsRows = /\bRETURNING\b/u.test(trimmed);
    if (isSelect || returnsRows) {
      const stmt = this.sqlite.query(this.query);
      const rows = stmt.all(...(this.params as never[])) as T[];
      const duration = performance.now() - start;
      return {
        results: rows,
        success: true,
        meta: {
          duration,
          size_after: 0,
          rows_read: Math.max(1, rows.length),
          rows_written: returnsRows ? rows.length : 0,
          last_row_id: 0,
          changed_db: returnsRows && rows.length > 0,
          changes: returnsRows ? rows.length : 0,
        },
      };
    } else {
      const stmt = this.sqlite.query(this.query);
      const info = stmt.run(...(this.params as never[]));
      const duration = performance.now() - start;
      return {
        results: [],
        success: true,
        meta: {
          duration,
          size_after: 0,
          rows_read: 0,
          rows_written: info.changes,
          last_row_id: Number(info.lastInsertRowid ?? 0),
          changed_db: info.changes > 0,
          changes: info.changes,
        },
      };
    }
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.executeSync<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.executeSync<T>();
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const res = this.executeSync<Record<string, unknown>>();
    const row = res.results[0];
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }
}
