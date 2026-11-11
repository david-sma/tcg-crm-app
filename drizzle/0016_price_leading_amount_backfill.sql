-- Follow-up to 0015 (already applied on dev, so not edited): prices that START
-- with an amount but carry extra text (e.g. "$82+gst", "450 incl GST") also get
-- price_cents from that leading amount. The original text is kept as the
-- pricing note so nothing is lost. Idempotent: only rows still unpriced.
UPDATE "jobs"
SET "price_cents" = round(regexp_replace(substring("agreed_price" from '^[[:space:]]*\$?[[:space:]]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)'), ',', '', 'g')::numeric * 100)::integer
WHERE "price_cents" IS NULL
  AND "agreed_price" ~ '^[[:space:]]*\$?[[:space:]]*[0-9][0-9,]*(\.[0-9]{1,2})?';
--> statement-breakpoint

UPDATE "job_series"
SET "price_cents" = round(regexp_replace(substring("agreed_price" from '^[[:space:]]*\$?[[:space:]]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)'), ',', '', 'g')::numeric * 100)::integer
WHERE "price_cents" IS NULL
  AND "agreed_price" ~ '^[[:space:]]*\$?[[:space:]]*[0-9][0-9,]*(\.[0-9]{1,2})?';
