-- Existing embeddings predate the course/doc_kind/block_kind metadata indexes.
UPDATE course_blocks SET vectorized = 0 WHERE vectorized = 1;
