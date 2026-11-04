-- Backfill password_changed_at for existing users so the 30-day password
-- reminder does not flag every pre-existing account as due on first boot.
-- Idempotent: the WHERE clause makes re-runs a no-op.
UPDATE "users" SET "password_changed_at" = "created_at" WHERE "password_changed_at" IS NULL;
