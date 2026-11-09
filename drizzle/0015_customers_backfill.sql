-- Customers backfill + numeric price conversion.
-- Idempotent: every statement only touches rows that are still unlinked /
-- unconverted, so a re-run is a no-op.

-- 1. One customer per distinct customer name (case/space-insensitive), using
--    the most recent job's contact details. Names that already have a customer
--    are skipped. Jobs whose type is commercial mark the customer commercial.
INSERT INTO "customers" ("id", "name", "customer_type", "phone", "email", "address", "notes", "created_by_user_id", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  latest.customer_name,
  CASE WHEN latest.any_commercial THEN 'commercial' ELSE 'residential' END,
  latest.customer_phone,
  latest.customer_email,
  NULLIF(latest.address, ''),
  NULL,
  NULL,
  latest.first_created_at,
  latest.first_created_at
FROM (
  SELECT DISTINCT ON (lower(btrim(j.customer_name)))
    btrim(j.customer_name) AS customer_name,
    j.customer_phone,
    j.customer_email,
    j.address,
    min(j.created_at) OVER (PARTITION BY lower(btrim(j.customer_name))) AS first_created_at,
    bool_or(j.job_type IN ('commercial_clean', 'common_areas')) OVER (PARTITION BY lower(btrim(j.customer_name))) AS any_commercial
  FROM "jobs" j
  WHERE btrim(j.customer_name) <> ''
  ORDER BY lower(btrim(j.customer_name)), j.created_at DESC
) latest
WHERE NOT EXISTS (
  SELECT 1 FROM "customers" c WHERE lower(btrim(c."name")) = lower(btrim(latest.customer_name))
);
--> statement-breakpoint

-- 2. Link jobs and recurring series to their customer by name.
UPDATE "jobs" j
SET "customer_id" = c."id"
FROM "customers" c
WHERE j."customer_id" IS NULL
  AND lower(btrim(j."customer_name")) = lower(btrim(c."name"));
--> statement-breakpoint

UPDATE "job_series" s
SET "customer_id" = c."id"
FROM "customers" c
WHERE s."customer_id" IS NULL
  AND lower(btrim(s."customer_name")) = lower(btrim(c."name"));
--> statement-breakpoint

-- 3. Convert plain-number prices ("140", "$2000", "1,250.50") into price_cents
--    and clear the text; anything else stays in agreed_price as a pricing note.
UPDATE "jobs"
SET "price_cents" = round(regexp_replace("agreed_price", '[[:space:]$,]', '', 'g')::numeric * 100)::integer,
    "agreed_price" = NULL
WHERE "price_cents" IS NULL
  AND "agreed_price" ~ '^[[:space:]]*\$?[[:space:]]*[0-9][0-9,]*(\.[0-9]{1,2})?[[:space:]]*$';
--> statement-breakpoint

UPDATE "job_series"
SET "price_cents" = round(regexp_replace("agreed_price", '[[:space:]$,]', '', 'g')::numeric * 100)::integer,
    "agreed_price" = NULL
WHERE "price_cents" IS NULL
  AND "agreed_price" ~ '^[[:space:]]*\$?[[:space:]]*[0-9][0-9,]*(\.[0-9]{1,2})?[[:space:]]*$';
