#!/usr/bin/env bun
/**
 * Local admin CLI for managing D1 configuration & encrypted Codex credentials
 * directly via Wrangler / CLOUDFLARE_API_TOKEN (no public admin HTTP endpoints).
 *
 * Usage:
 *   bun run scripts/admin.ts init-db [--remote]
 *   bun run scripts/admin.ts set-codex-token [--remote] [--refresh-token <tok>] [--account-id <id>]
 *   bun run scripts/admin.ts set-policy <path-to-policy.json> [--remote]
 *   bun run scripts/admin.ts sync-telegram-accounts <path-to-ids.txt> [--remote]
 *   bun run scripts/admin.ts set-tier <telegram-id> <default|student|extended> [--remote]
 *   bun run scripts/admin.ts status [--remote]
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { encryptJsonAesGcm } from "../src/crypto";
import type { CodexCredentialsPayload } from "../src/llm/codex-auth";
import { assignmentSql, parseTelegramIds, rosterSql } from "./admin-tiers";
import initialPolicy from "../policy.json";
import type { ServicePolicy } from "../src/types";

const DB_NAME = "hse-lecture-notes";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runD1(args: string[], remote: boolean): void {
  const target = remote ? "--remote" : "--local";
  const proc = spawnSync("bunx", ["wrangler", "d1", ...args, target], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "inherit",
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) process.exit(proc.status ?? 1);
}

function runD1Sql(sql: string, remote: boolean): void {
  runD1(["execute", DB_NAME, "--command", sql], remote);
}

function initializeDatabase(remote: boolean): void {
  runD1(["migrations", "apply", DB_NAME], remote);
  runD1Sql(`INSERT INTO service_config (key, value_json, updated_at)
VALUES ('policy', ${sqlString(JSON.stringify(initialPolicy satisfies ServicePolicy))}, ${Date.now()})
ON CONFLICT(key) DO NOTHING`, remote);
}

function validatePolicyPatch(value: unknown, template: unknown, path: string): void {
  if (template && typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected an object at ${path}`);
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(template, key)) throw new Error(`Unknown policy field ${path}.${key}`);
      validatePolicyPatch(item, (template as Record<string, unknown>)[key], `${path}.${key}`);
    }
  } else if (typeof value !== typeof template || (typeof value === "string" && !value.trim()) ||
      (typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
    throw new Error(`Invalid policy value at ${path}`);
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
  init-db [--remote]
    Applies the schema and initializes missing service policy.
  set-codex-token [--remote] [--refresh-token <tok>] [--account-id <id>]
    Reads CODEX_CREDENTIALS_ENCRYPTION_KEY and CODEX_INITIAL_REFRESH_TOKEN from env if not passed.
  set-policy <policy.json> [--remote]
    Merges and writes service_config['policy'].
  sync-telegram-accounts <ids.txt> [--remote]
    Syncs student roster assignments; preserves manual assignments.
  set-tier <telegram-id> <default|student|extended> [--note <note>] [--remote]
    Assigns a tier; default removes the override.
  status [--remote]
    Shows credential status, policy timestamps, and assigned tier counts.`);
    return;
  }

  if (cmd === "init-db") {
    initializeDatabase(remote);
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
    validatePolicyPatch(raw, initialPolicy, "policy");
    const patch = sqlString(JSON.stringify(raw));
    const sql = `INSERT INTO service_config (key, value_json, updated_at)
VALUES ('policy', json_patch(${sqlString(JSON.stringify(initialPolicy))}, ${patch}), ${now})
ON CONFLICT(key) DO UPDATE SET value_json = json_patch(service_config.value_json, ${patch}), updated_at = excluded.updated_at;`;
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
    const ids = parseTelegramIds(readFileSync(file, "utf8"));
    runD1Sql(rosterSql(ids, now), remote);
    console.log(`Synced ${ids.length} student roster entries; manual tiers preserved.`);
    return;
  }

  if (cmd === "set-tier") {
    if (!args[1] || !args[2]) throw new Error("Usage: set-tier <telegram-id> <default|student|extended> [--note <note>] [--remote]");
    runD1Sql(assignmentSql(args[1], args[2], now, getFlag(args, "--note")), remote);
    console.log("Account tier updated.");
    return;
  }

  if (cmd === "status") {
    const sql = `SELECT id, version, status, lease_until, updated_at FROM codex_credentials;
SELECT tier, COUNT(*) AS accounts FROM telegram_account_tiers GROUP BY tier;
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
