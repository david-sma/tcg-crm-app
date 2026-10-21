ALTER TABLE "jobs" ADD COLUMN "ready_at" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "faults_damages_checked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "faults_damages_checked_at" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "faults_damages_checked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_faults_damages_checked_by_user_id_users_id_fk" FOREIGN KEY ("faults_damages_checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "job_assignments" ja SET "is_lead" = false WHERE ja."is_lead" AND EXISTS (SELECT 1 FROM "job_assignments" jb WHERE jb."job_id" = ja."job_id" AND jb."is_lead" AND (jb."created_at" < ja."created_at" OR (jb."created_at" = ja."created_at" AND jb."id" < ja."id")));--> statement-breakpoint
CREATE UNIQUE INDEX "job_assignments_one_lead_idx" ON "job_assignments" USING btree ("job_id") WHERE is_lead;