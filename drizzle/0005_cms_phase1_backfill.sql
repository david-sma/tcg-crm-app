UPDATE "jobs" SET "status" = 'awaiting_info' WHERE "status" = 'enriching';--> statement-breakpoint
UPDATE "jobs" SET "status" = 'deal_confirmed' WHERE "status" = 'confirmed';--> statement-breakpoint
UPDATE "jobs" SET "status" = 'scheduled' WHERE "status" = 'ongoing';--> statement-breakpoint
UPDATE "users" SET "role" = 'staff' WHERE "role" = 'team_leader';--> statement-breakpoint
UPDATE "jobs" SET "ready_at" = COALESCE("updated_at", "created_at") WHERE "ready_at" IS NULL AND "status" IN ('deal_confirmed', 'scheduled', 'in_progress', 'completed');--> statement-breakpoint
UPDATE "jobs" SET "faults_damages_checked" = true, "faults_damages_checked_at" = COALESCE("completed_at", "updated_at"), "faults_damages_checked_by_user_id" = COALESCE("late_reported_by_user_id", "created_by_user_id") WHERE "status" = 'completed' AND "faults_damages_checked" = false;
