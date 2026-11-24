#!/usr/bin/env bun
/**
 * Local admin CLI for managing D1 configuration & encrypted Codex credentials
 * directly via Wrangler / CLOUDFLARE_API_TOKEN (no public admin HTTP endpoints).
 *
 * Usage:
 *   bun run scripts/admin.ts set-codex-token [--remote] [--refresh-token <tok>] [--account-id <id>]
 *   bun run scripts/admin.ts set-policy <path-to-policy.json> [--remote]
 *   bun run scripts/admin.ts sync-telegram-accounts <path-to-ids.txt> [--remote]
 *   bun run scripts/admin.ts status [--remote]
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { encryptJsonAesGcm } from "../src/crypto";
import type { CodexCredentialsPayload } from "../src/codex-auth";
import { DEFAULT_POLICY } from "../src/types";

const DB_NAME = "hse-lecture-notes";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runD1Sql(sql: string, remote: boolean): void {
  const args = ["wrangler", "d1", "execute", DB_NAME, remote ? "--remote" : "--local", "--command", sql];
  const proc = spawnSync("bunx", args, {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "inherit",
    env: process.env,
  });
  if (proc.status !== 0) {
    process.exit(proc.status ?? 1);
  }
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const remote = args.includes("--remote");
  const now = Date.now();

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`Commands:
  set-codex-token [--remote] [--refresh-token <tok>] [--account-id <id>]
    Reads CODEX_CREDENTIALS_ENCRYPTION_KEY and CODEX_INITIAL_REFRESH_TOKEN from env if not passed.
  set-policy <policy.json> [--remote]
    Merges and writes service_config['policy'].
  sync-telegram-accounts <ids.txt> [--remote]
    Replaces internal_telegram_accounts from a newline/comma-separated list of numeric Telegram IDs.
  status [--remote]
    Shows codex_credentials status, policy, and internal account count.`);
    return;
  }

  if (cmd === "set-codex-token") {
    const encryptionKey = process.env.CODEX_CREDENTIALS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      console.error("Missing env CODEX_CREDENTIALS_ENCRYPTION_KEY");
      process.exit(1);
    }
    const refreshToken = getFlag(args, "--refresh-token") ?? process.env.CODEX_INITIAL_REFRESH_TOKEN;
    if (!refreshToken) {
      console.error("Missing --refresh-token or env CODEX_INITIAL_REFRESH_TOKEN");
      process.exit(1);
    }
    const accountId = getFlag(args, "--account-id") ?? process.env.CODEX_ACCOUNT_ID ?? "";
    const payload: CodexCredentialsPayload = {
      accessToken: "",
      refreshToken: refreshToken.trim(),
      accountId: accountId.trim(),
      expiresAt: 0,
    };
    const encrypted = await encryptJsonAesGcm(encryptionKey, payload);
    const sql = `INSERT INTO codex_credentials (id, version, encrypted_payload, status, lease_owner, lease_until, updated_at)
VALUES (1, 1, ${sqlString(encrypted)}, 'ok', NULL, 0, ${now})
ON CONFLICT(id) DO UPDATE SET
  version = codex_credentials.version + 1,
  encrypted_payload = excluded.encrypted_payload,
  status = 'ok',
  lease_owner = NULL,
  lease_until = 0,
  updated_at = excluded.updated_at;`;
    runD1Sql(sql, remote);
    console.log("Encrypted codex_credentials updated successfully.");
    return;
  }

  if (cmd === "set-policy") {
    const file = args[1];
    if (!file || file.startsWith("--")) {
      console.error("Usage: set-policy <policy.json> [--remote]");
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const merged = {
      ...DEFAULT_POLICY,
      ...raw,
      budgets: { ...DEFAULT_POLICY.budgets, ...(raw.budgets as Record<string, unknown> | undefined) },
      tiers: { ...DEFAULT_POLICY.tiers, ...(raw.tiers as Record<string, unknown> | undefined) },
    };
    const sql = `INSERT INTO service_config (key, value_json, updated_at)
VALUES ('policy', ${sqlString(JSON.stringify(merged))}, ${now})
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`;
    runD1Sql(sql, remote);
    console.log("Policy updated successfully.");
    return;
  }

  if (cmd === "sync-telegram-accounts") {
    const file = args[1];
    if (!file || file.startsWith("--")) {
      console.error("Usage: sync-telegram-accounts <ids.txt> [--remote]");
      process.exit(1);
    }
    const content = readFileSync(file, "utf8");
    const ids = Array.from(
      new Set(
        content
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter((s) => /^\d+$/.test(s))
          .map((s) => Number(s)),
      ),
    );
    if (ids.length === 0) {
      console.error("No valid numeric Telegram IDs found in", file);
      process.exit(1);
    }
    const values = ids.map((id) => `(${id}, 'roster', ${now})`).join(",\n  ");
    const sql = `DELETE FROM internal_telegram_accounts;
INSERT INTO internal_telegram_accounts (telegram_id, note, added_at) VALUES
  ${values};`;
    runD1Sql(sql, remote);
    console.log(`Synced ${ids.length} internal Telegram accounts.`);
    return;
  }

  if (cmd === "status") {
    const sql = `SELECT id, version, status, lease_until, updated_at FROM codex_credentials;
SELECT COUNT(*) AS internal_accounts FROM internal_telegram_accounts;
SELECT global_reserved_micros, guest_reserved_micros FROM budget_reserves WHERE id = 1;
SELECT key, updated_at FROM service_config;`;
    runD1Sql(sql, remote);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
