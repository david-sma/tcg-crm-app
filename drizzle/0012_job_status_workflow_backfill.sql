-- Simplified job workflow: Awaiting Info -> Process Queue -> Scheduled.
-- The 'deal_confirmed' step is gone (scheduling is the confirmation) and jobs
-- now start at 'awaiting_info' instead of 'new'.
-- Idempotent: each WHERE clause matches nothing after the first run.
UPDATE "jobs" SET "status" = 'ready' WHERE "status" = 'deal_confirmed';
UPDATE "jobs" SET "status" = 'awaiting_info' WHERE "status" = 'new';
