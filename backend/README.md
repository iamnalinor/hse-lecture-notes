# `hse-lecture-notes-api` (`backend/`)

Cloudflare Workers Free backend for the AI study assistant on `hse.nalinor.dev`.

## Architecture
- **HTTP Worker (`src/index.ts`)**: `/v1/health`, `/v1/auth/nonce`, `/v1/auth/telegram`, `/v1/auth/logout`, `/v1/allowance`, `/v1/thread`, `/v1/runs/:runId/status`.
- **SQLite-backed Durable Object (`ChatRunner`, `src/chat/runner.ts`)**: `WS /v1/messages` — runs the multi-round LLM agent loop (up to 8 rounds / 16 tool calls, 30 s CPU limit, 60 s generation kept alive even after client disconnect), handles in-socket `{ type: "stop" }`, and closes the socket immediately on completion.
- **D1 (`hse-lecture-notes`)**: schema in `migrations/` (sessions, hourly O(1) budget buckets, quotas, threads, messages, FTS5 course materials).
- **Vectorize (`hse-course-blocks`, 1024 dim cosine) + Workers AI (`@cf/baai/bge-m3`)**: semantic search with automatic fallback to FTS5.

## Model configuration

The service policy lives in D1 under `service_config.policy`. `policy.json` contains illustrative bootstrap defaults for each bucket’s model, reasoning effort, pricing version and per-tier limits. Production limits belong only in D1; keep private policy files and user assignments outside the checkout. `init-db` seeds the policy once. Use `set-policy` with a full policy or a partial JSON object to update it. New runs use the current policy and keep their model, effort and pricing version through completion. Versioned tariffs live in `src/pricing.ts`. Deploy a new tariff version before selecting it in the policy.

## LLM provider selection

`LlmProvider` has two implementations: Codex OAuth (the default) and the standard OpenAI **Responses API** with API-key authentication. `ChatRunner` selects the provider from runtime environment variables; no code changes are needed to switch. Existing installations keep using Codex when `LLM_PROVIDER` is unset or `codex`. Setting an OpenAI key alone never switches providers. Production explicitly selects `openai` in the versioned Worker configuration.

For OpenAI, set these Worker environment variables/secrets (or put them in `backend/.env` for local `wrangler dev`; `.env` is ignored by Git):

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_API_KEY` is a secret. `OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`; the provider appends `/responses`, preserving custom path prefixes and accepting trailing slashes. A custom endpoint must support the Responses API, SSE streaming and function calling; a gateway that only implements `/chat/completions` is insufficient. For a local mock, an HTTP URL is supported. OpenAI requests use direct fetch and do not use `CODEX_PROXY_URL`, OAuth refresh tokens or Codex-specific headers.

Models, reasoning effort, pricing versions, quotas and budgets remain in the existing D1 policy. The selected endpoint must accept the configured model names and reasoning effort, and the policy must select a published tariff for those models. Switching provider does not rewrite the policy or tariff table.

Both providers share Responses stream parsing, token accounting, tool calls, output limits and cancellation. OpenAI sends `store: false`, replays encrypted reasoning between tool rounds, and preserves optional tool arguments with `strict: false`. HTTP and stream failures are surfaced without automatic retries of possibly billable requests. To switch back, set `LLM_PROVIDER=codex` or remove it.

Protocol reference: [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

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

The daily cron cleans expired nonces and sessions. With R2 disabled it logs
`archive_skipped_no_bucket` and keeps conversation history and usage records in D1.
To enable archiving later, create a private R2 bucket and add it to Wrangler's
`r2_buckets` with the binding `ARCHIVE_BUCKET`. The cron then copies inactive
records after `archiveAfterDays` (default 30 days) and verifies the R2 copy before
deleting D1 rows. R2 retention is configured separately on the bucket.

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

## Checks

```bash
bun run typecheck
bun test
# Opt-in real API checks: one short answer and a two-round tool exchange.
# Uses the key and optional OPENAI_BASE_URL from the ignored root .env.
env -u OPENAI_API_KEY -u OPENAI_BASE_URL OPENAI_LIVE_TESTS=1 \
  bun --env-file=../.env test tests/openai-live.test.ts
```

The command clears inherited key/base URL values before loading the file, because Bun preserves existing environment variables over `.env` values.

Live tests default to `gpt-6-luna` with low reasoning effort. Override `OPENAI_TEST_MODEL` and `OPENAI_TEST_EFFORT` for a model supported by the endpoint. They are skipped in the ordinary suite and never switch the active Worker provider.

## Turn metadata and bounded context

New chats first make a forced hidden strict `set_topic({title})` call. The harness validates and persists the title before showing the answer; later topic changes are optional and published immediately. A saved title survives a subsequent stop or incomplete answer. Service-stage text and all metadata calls, arguments, acknowledgements and validation errors remain private.

`suggest_reply({suggestion})` is optional and requested after the visible answer. Suggestions use natural plain user wording, usually 3–7 words (target 50, hard cap 80 Unicode code points), without Markdown or TeX. Missing or invalid suggestions leave the ordinary placeholder and do not invalidate the answer. Tab inserts the placeholder without sending; touch only displays it.

Parallel search/read calls remain enabled, with 8 provider rounds, 16 executed search/read calls, 12,000 characters per result, 60,000 material-output characters in total and 60 seconds per run. Tool definitions stay stable; the final available round disables calls through `tool_choice: none`. There is no mandatory finishing tool or metadata repair loop. Capped tool results are replayed as raw text. Exhausting the material-output budget forces the next round to answer from existing results; remaining calls receive a fixed internal explanation. Internal note steps stay out of public history and the UI. Known usage and conservative unknown-round estimates are settled even on failure. Terminal WebSocket frames carry the same safe error explanation as restored history; raw upstream payloads stay private.

The model receives a whole-exchange suffix: at most 15 logical user/assistant messages including the new question, and 50,000 JavaScript characters in serialized input items. Context snapshots, quotes, calls/results and encrypted reasoning count toward size. The complete visible conversation remains stored. Reaching either threshold latches only that thread to the low route with its own quota/reserve and a persistent warning. New threads keep ordinary routing. Context revision plus max sequence guards admission against finalize/retry races.

System instructions and tool definitions remain stable. The immutable snapshot of each question stores navigation/catalog/time/title context next to that question. Complete compatible reasoning/tool exchanges replay within the window; changed or unverified provider/model/effort/prefix compatibility falls back the entire historical exchange to its original question snapshot and visible answer, preserving the stored original.

Bootstrap defaults and production policy target a $15 rolling seven-day global budget, warning at $12; actual plus reserved spend gates admission. Standard tariffs for Terra and Luna were rechecked on 2026-11-24 against [official pricing](https://developers.openai.com/api/docs/pricing.md); pricing version 1 remains valid. Cache savings use returned usage, not an assumed cache hit rate.



### Search index provisioning

Before the first metadata-aware sync, create the three string indexes on the existing 1024-dimensional cosine index. Run these commands in `backend/` with the deployment account.

```sh
bunx wrangler vectorize create-metadata-index hse-course-blocks --property-name=course --type=string
bunx wrangler vectorize create-metadata-index hse-course-blocks --property-name=doc_kind --type=string
bunx wrangler vectorize create-metadata-index hse-course-blocks --property-name=block_kind --type=string
bunx wrangler vectorize list-metadata-index hse-course-blocks
```

After the metadata indexes are ready, apply D1 migrations and run `uv run python scripts/export_search_index.py --sync-remote --fail-on-vectorize-overflow` from the repository root. Migration 0003 marks existing embeddings for refresh. D1 and FTS cover the full corpus. The exporter reconciles the dedicated Vectorize index against the highest-priority 4,800 block IDs and waits for each mutation to be processed. Run one sync at a time. If a run fails, rerun the same command. The main-branch Build notes workflow reports sync failures in its summary and still publishes the notes.
