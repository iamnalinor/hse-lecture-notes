-- Additive: preserve existing history and accounting across provider rollout.
ALTER TABLE chat_messages ADD COLUMN prompt_context_json TEXT;
ALTER TABLE chat_messages ADD COLUMN suggestion TEXT;
ALTER TABLE chat_threads ADD COLUMN context_limited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_threads ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_runs ADD COLUMN provider TEXT;
