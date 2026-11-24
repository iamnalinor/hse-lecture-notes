-- Migration 0001: Initial schema for HSE Lecture Notes AI Chat (D1 SQLite + FTS5)

PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. Service configuration, budgets, OAuth credentials, accounts & sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_hourly (
  hour_ts INTEGER PRIMARY KEY,
  global_actual_micros INTEGER NOT NULL DEFAULT 0,
  guest_actual_micros INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_reserves (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  global_reserved_micros INTEGER NOT NULL DEFAULT 0,
  guest_reserved_micros INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS codex_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  encrypted_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'needs_reauth'
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_telegram_accounts (
  telegram_id INTEGER PRIMARY KEY,
  note TEXT,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  telegram_name TEXT NOT NULL,
  browser_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- =============================================================================
-- 2. Chat threads, messages & usage runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  generated_title TEXT,
  browser_id TEXT,
  telegram_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((browser_id IS NOT NULL AND telegram_id IS NULL) OR (browser_id IS NULL AND telegram_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_browser
  ON chat_threads(browser_id, updated_at DESC, id DESC)
  WHERE browser_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_tg
  ON chat_threads(telegram_id, updated_at DESC, id DESC)
  WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_threads_inactive
  ON chat_threads(updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,               -- 'user' | 'assistant'
  status TEXT NOT NULL,             -- 'done' | 'running' | 'stopped' | 'incomplete' | 'error'
  content_tex TEXT NOT NULL,
  course TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  quote_json TEXT,
  steps_json TEXT,
  agent_items_json TEXT,
  error_message TEXT,
  run_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_thread_seq
  ON chat_messages(thread_id, seq);

CREATE TABLE IF NOT EXISTS usage_runs (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,          -- 'tg:<telegram_id>' | 'br:<browser_id>'
  client_request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,             -- 'running' | 'done' | 'stopped' | 'incomplete' | 'error'
  tier TEXT NOT NULL,               -- 'guest' | 'external' | 'internal'
  quota_bucket TEXT NOT NULL,       -- 'high' | 'low'
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL CHECK (length(trim(reasoning_effort)) > 0),
  pricing_version INTEGER NOT NULL DEFAULT 1,
  reserved_cost_micros INTEGER NOT NULL DEFAULT 0,
  actual_cost_micros INTEGER NOT NULL DEFAULT 0,
  is_cost_uncertain INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  tool_rounds INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  telegram_id INTEGER,
  browser_id TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  error_code TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_runs_idempotency
  ON usage_runs(owner_key, client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_runs_active_thread
  ON usage_runs(thread_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_usage_runs_active
  ON usage_runs(status, expires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_usage_runs_time
  ON usage_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_runs_tg
  ON usage_runs(telegram_id, quota_bucket, created_at) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_runs_browser
  ON usage_runs(browser_id, quota_bucket, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_runs_ip
  ON usage_runs(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_runs_fp
  ON usage_runs(fingerprint, created_at) WHERE fingerprint != '';

-- =============================================================================
-- 3. Indexed course materials (documents, blocks, FTS5, cross-references)
-- =============================================================================

CREATE TABLE IF NOT EXISTS course_documents (
  id TEXT PRIMARY KEY,              -- '<course>:<doc_kind>:<doc_id>'
  course TEXT NOT NULL,
  doc_kind TEXT NOT NULL,           -- 'lecture' | 'theory' | 'prep' | 'program'
  doc_id TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  date TEXT,
  outline_json TEXT NOT NULL,       -- [{ id, title, level }]
  body_tex TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_documents_course
  ON course_documents(course, doc_kind, order_index);

CREATE TABLE IF NOT EXISTS course_blocks (
  id TEXT PRIMARY KEY,              -- canonical block id, e.g. 'thm:lec07:fta' or '<course>:<doc_id>#sec:...'
  course TEXT NOT NULL,
  doc_kind TEXT NOT NULL,           -- 'lecture' | 'theory' | 'prep' | 'program'
  doc_id TEXT NOT NULL,
  doc_order INTEGER NOT NULL DEFAULT 0,
  block_order INTEGER NOT NULL DEFAULT 0,
  block_kind TEXT NOT NULL,         -- 'theorem' | 'lemma' | 'proposition' | 'corollary' | 'definition' | 'axiom' | 'problem' | 'example' | 'remark' | 'ticket' | 'section'
  anchor_id TEXT NOT NULL,
  section_id TEXT,
  title TEXT NOT NULL,
  statement_tex TEXT NOT NULL,
  proof_tex TEXT NOT NULL DEFAULT '',
  lemmas TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  vectorized INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_blocks_doc
  ON course_blocks(course, doc_id, block_order);
CREATE INDEX IF NOT EXISTS idx_course_blocks_course_kind
  ON course_blocks(course, doc_kind, block_kind);

CREATE VIRTUAL TABLE IF NOT EXISTS course_blocks_fts USING fts5(
  id UNINDEXED,
  course UNINDEXED,
  doc_kind UNINDEXED,
  block_kind UNINDEXED,
  title,
  statement_tex,
  proof_tex,
  lemmas,
  tokenize = 'unicode61 remove_diacritics 0'
);

CREATE TABLE IF NOT EXISTS block_references (
  from_block_id TEXT NOT NULL,
  to_block_id TEXT NOT NULL,
  ref_kind TEXT NOT NULL DEFAULT 'ref',
  PRIMARY KEY (from_block_id, to_block_id)
);

CREATE INDEX IF NOT EXISTS idx_block_references_to
  ON block_references(to_block_id);

-- =============================================================================
-- 4. Seed safe defaults
-- =============================================================================

INSERT OR IGNORE INTO budget_reserves (id, global_reserved_micros, guest_reserved_micros, updated_at)
VALUES (1, 0, 0, 0);

INSERT OR IGNORE INTO service_config (key, value_json, updated_at)
VALUES (
  'alerts_state',
  '{"lastWeeklyWarnAt":0,"lastWeeklyExceededAt":0,"lastGuestExceededAt":0,"lastOauthErrorAt":0}',
  0
);
