ALTER TABLE "jobs" ADD COLUMN "services_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "allocated_driver_user_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "running_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "late_reported_at" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "late_reported_by_user_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "late_note" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_allocated_driver_user_id_users_id_fk" FOREIGN KEY ("allocated_driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_late_reported_by_user_id_users_id_fk" FOREIGN KEY ("late_reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;