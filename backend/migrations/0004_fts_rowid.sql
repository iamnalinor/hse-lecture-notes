-- FTS rows share course_blocks.rowid from now on; scripts/export_search_index.py
-- rebuilds course_blocks_fts once (marker service_config.fts_rowid_aligned_v1) and
-- then deletes by rowid. Deleting by the UNINDEXED id column scanned the whole FTS
-- table per statement and exhausted the account's D1 daily read limit on 2026-11-25.

-- Anchor lookups filter course + anchor_id.
CREATE INDEX IF NOT EXISTS idx_course_blocks_anchor ON course_blocks(course, anchor_id);
