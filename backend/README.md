# `hse-lecture-notes-api` (`backend/`)

Cloudflare Workers Free backend for the AI study assistant on `hse.nalinor.dev`.

## Architecture
- **HTTP Worker (`src/index.ts`)**: `/v1/health`, `/v1/auth/nonce`, `/v1/auth/telegram`, `/v1/auth/logout`, `/v1/allowance`, `/v1/thread`, `/v1/runs/:runId/status`.
- **SQLite-backed Durable Object (`ChatRunner`, `src/chat-runner.ts`)**: `WS /v1/messages` — runs the multi-round Codex agent loop (up to 5 rounds / 10 tool calls, 30 s CPU limit, 60 s generation kept alive even after client disconnect), handles in-socket `{ type: "stop" }`, and closes the socket immediately on completion.
- **D1 (`hse-lecture-notes`)**: schema in `migrations/` (sessions, hourly O(1) budget buckets, quotas, threads, messages, FTS5 course materials).
- **Vectorize (`hse-course-blocks`, 1024 dim cosine) + Workers AI (`@cf/baai/bge-m3`)**: semantic search with automatic fallback to FTS5.

## Model configuration

The service policy lives in D1 under `service_config.policy`. `policy.json` contains illustrative bootstrap defaults for each bucket’s model, reasoning effort, pricing version and per-tier limits. Production limits belong only in D1; keep private policy files and user assignments outside the checkout. `init-db` seeds the policy once. Use `set-policy` with a full policy or a partial JSON object to update it. New runs use the current policy and keep their model, effort and pricing version through completion. Versioned tariffs live in `src/pricing.ts`. Deploy a new tariff version before selecting it in the policy.

## Setup & Deployment

```bash
cd backend
bun install

# Initialize the schema and seed model settings (load credentials from the root .env)
bun --env-file=../.env run scripts/admin.ts init-db --remote

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
bun run admin set-policy /private/path/policy.json --remote

# Sync HSE PI student Telegram IDs
bun run admin sync-telegram-accounts /private/path/student_ids.txt --remote

# Manually assign a tier (default removes the assignment)
bun run admin set-tier <telegram-id> extended --remote
bun run admin set-tier <telegram-id> default --remote

# Inspect live status
bun run admin status --remote
```

Authenticated accounts without a row in `telegram_account_tiers` use `default` (low bucket only). Assigned `student` and `extended` accounts have separate high and low limits over a rolling 24-hour window: high is used first, then low. Unauthenticated visitors remain `guest`. Limits are read from the database policy, independently for each tier. Tier changes apply to existing sessions and allowance tokens on their next request.

Roster sync replaces only student assignments created by roster sync. It preserves manually assigned tiers, including `extended`. Use `set-tier` to change or remove a manual assignment. Telegram IDs and private policy values must never be committed.
