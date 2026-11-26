-- Cursor for a partially archived thread. Its source rows remain intact until the
-- verified final manifest is saved. A new thread revision starts a new chain.
CREATE TABLE archive_thread_progress (
  thread_id TEXT PRIMARY KEY REFERENCES chat_threads(id) ON DELETE CASCADE,
  snapshot_updated_at INTEGER NOT NULL,
  snapshot_revision INTEGER NOT NULL,
  max_seq INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  last_part_key TEXT NOT NULL
);
