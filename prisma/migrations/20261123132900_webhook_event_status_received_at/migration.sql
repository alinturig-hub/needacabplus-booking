-- Composite index for the webhook worker queue scans:
--   WHERE status IN ('RECEIVED','FAILED','PROCESSING') ORDER BY receivedAt
-- The 10.4M-row WebhookEvent table was being fully scanned several times per minute.
-- This index was already created CONCURRENTLY in production on 2026-11-23 13:29 UTC,
-- so IF NOT EXISTS makes this migration a no-op there. On a fresh database
-- (empty table) it creates the index normally.
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_receivedAt_idx"
  ON "WebhookEvent" ("status", "receivedAt");
