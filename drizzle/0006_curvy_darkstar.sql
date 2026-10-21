ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_allocated_driver_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "allocated_driver_user_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "details";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "scope_notes";
