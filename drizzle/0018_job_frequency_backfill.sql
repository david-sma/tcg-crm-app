-- Frequency tag backfill. Only jobs that belong to a recurring series get a
-- value (mapped from the series pattern); every other existing job stays NULL
-- ("Not set") rather than guessing "One-off". Idempotent: only NULL rows.

UPDATE "job_series"
SET "job_frequency" = CASE "frequency"
      WHEN 'weekly' THEN 'weekly'
      WHEN 'fortnightly' THEN 'two_weekly'
      ELSE 'custom'
    END,
    "job_frequency_note" = CASE WHEN "frequency" = 'daily' THEN 'Daily' ELSE NULL END
WHERE "job_frequency" IS NULL;
--> statement-breakpoint

UPDATE "jobs" j
SET "frequency" = s."job_frequency",
    "frequency_note" = s."job_frequency_note"
FROM "job_series" s
WHERE j."series_id" = s."id"
  AND j."frequency" IS NULL;
