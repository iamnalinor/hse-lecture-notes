# `hse-lecture-notes-api` (`backend/`)

Cloudflare Workers Free backend for the AI study assistant on `hse.nalinor.dev`.

## Architecture
- **HTTP Worker (`src/index.ts`)**: `/v1/health`, `/v1/auth/nonce`, `/v1/auth/telegram`, `/v1/auth/logout`, `/v1/allowance`, `/v1/thread`, `/v1/runs/:runId/status`.
- **SQLite-backed Durable Object (`ChatRunner`, `src/chat-runner.ts`)**: `WS /v1/messages` — runs the multi-round Codex agent loop (up to 5 rounds / 10 tool calls, 30 s CPU limit, 60 s generation kept alive even after client disconnect), handles in-socket `{ type: "stop" }`, and closes the socket immediately on completion.
- **D1 (`hse-lecture-notes`)**: schema in `migrations/0001_init.sql` (sessions, hourly O(1) budget buckets, quotas, threads, messages, FTS5 course materials).
- **Vectorize (`hse-course-blocks`, 1024 dim cosine) + Workers AI (`@cf/baai/bge-m3`)**: semantic search with automatic fallback to FTS5.

## Setup & Deployment

```bash
cd backend
bun install

# Apply D1 migrations
bunx wrangler d1 migrations apply hse-lecture-notes --remote

# Configure the runtime secrets
bunx wrangler secret put ALLOWANCE_JWT_SECRET
bunx wrangler secret put BROWSER_TOKEN_SECRET
bunx wrangler secret put CODEX_CREDENTIALS_ENCRYPTION_KEY
bunx wrangler secret put CODEX_PROXY_URL
bunx wrangler secret put TURNSTILE_SECRET_KEY
bunx wrangler secret put TELEGRAM_BOT_TOKEN
bunx wrangler secret put TELEGRAM_CLIENT_ID
bunx wrangler secret put OWNER_TELEGRAM_ID

# Deploy
bun run deploy
```

## Managing D1 State (No Admin HTTP Endpoints)

```bash
# Seed or rotate encrypted Codex OAuth refresh_token
CODEX_CREDENTIALS_ENCRYPTION_KEY=... CODEX_INITIAL_REFRESH_TOKEN=... \
  bun run admin set-codex-token --remote

# Update service policy JSON
bun run admin set-policy ./policy.json --remote

# Sync HSE PI student Telegram IDs
bun run admin sync-telegram-accounts ./student_ids.txt --remote

# Inspect live status
bun run admin status --remote
```
