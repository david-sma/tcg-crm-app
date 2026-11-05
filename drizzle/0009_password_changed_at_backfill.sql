-- Backfill password_changed_at for existing users with the deploy time, so the
-- 30-day password reminder starts counting from this release instead of
-- flagging every pre-existing account as due on first boot.
-- Stored as an ISO-8601 UTC string, matching new Date().toISOString().
-- Idempotent: the WHERE clause makes re-runs a no-op.
UPDATE "users"
SET "password_changed_at" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE "password_changed_at" IS NULL;
