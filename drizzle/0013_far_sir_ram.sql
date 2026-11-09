CREATE TABLE "job_series" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"frequency" text NOT NULL,
	"days_of_week" text DEFAULT '[]' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"start_time" text NOT NULL,
	"finish_time" text NOT NULL,
	"first_job_id" text,
	"generated_through" text,
	"title" text DEFAULT '' NOT NULL,
	"job_type" text DEFAULT '' NOT NULL,
	"services_text" text,
	"lead_source" text DEFAULT 'manual' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"site_contact_name" text,
	"site_contact_phone" text,
	"address" text DEFAULT '' NOT NULL,
	"location_notes" text,
	"access_notes" text,
	"agreed_price" text,
	"ended_at" text,
	"ended_by_user_id" text,
	"end_reason" text,
	"created_by_user_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "occurrence_date" text;--> statement-breakpoint
ALTER TABLE "job_series" ADD CONSTRAINT "job_series_first_job_id_jobs_id_fk" FOREIGN KEY ("first_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_series" ADD CONSTRAINT "job_series_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_series" ADD CONSTRAINT "job_series_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_series_status_idx" ON "job_series" USING btree ("status");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_series_id_job_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."job_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_series_idx" ON "jobs" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_series_occurrence_idx" ON "jobs" USING btree ("series_id","occurrence_date");