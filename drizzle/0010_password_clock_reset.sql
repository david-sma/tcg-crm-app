-- Follow-up to 0009. Its fix (start the clock at deploy time instead of
-- created_at) was edited into 0009 after 0009 had already run on dev and prod,
-- so the fix never took effect: pre-existing accounts kept
-- password_changed_at = created_at and were all flagged "password due".
-- Restart the 30-day clock from this migration's run time for those accounts.
-- Accounts whose password was reset since (password_changed_at differs from
-- created_at) are left alone. Stored as an ISO-8601 UTC string, matching
-- new Date().toISOString(). Idempotent: a re-run only touches rows that still
-- match, which no longer exist after the first run.
UPDATE "users"
SET "password_changed_at" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE "password_changed_at" IS NULL OR "password_changed_at" = "created_at";
