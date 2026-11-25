-- Preserve operator overrides and leave all unrelated policy fields intact.
UPDATE service_config
SET value_json = json_set(value_json, '$.maxRunDurationMs', 90000, '$.staleRunTimeoutMs', 105000),
    updated_at = unixepoch() * 1000
WHERE key = 'policy'
  AND json_extract(value_json, '$.maxRunDurationMs') = 60000
  AND json_extract(value_json, '$.staleRunTimeoutMs') = 75000;
