DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'suburb'
  ) THEN
    UPDATE "jobs" SET "address" = trim(both ' ,.' from (
      "address"
      || CASE WHEN COALESCE("suburb", '') <> '' AND position(lower("suburb") in lower("address")) = 0 THEN ', ' || "suburb" ELSE '' END
      || CASE WHEN COALESCE("city", '') <> '' AND position(lower("city") in lower("address")) = 0 THEN ', ' || "city" ELSE '' END
      || CASE WHEN COALESCE("postcode", '') <> '' AND position(lower("postcode") in lower("address")) = 0 THEN ', ' || "postcode" ELSE '' END
    )) WHERE COALESCE("suburb", "city", "postcode") IS NOT NULL;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "suburb";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "city";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "postcode";
