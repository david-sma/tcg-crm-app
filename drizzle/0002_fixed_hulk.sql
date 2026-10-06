CREATE TABLE "job_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"shift_id" text,
	"user_id" text NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_media" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"phase" text NOT NULL,
	"media_type" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"original_ref" text,
	"processed_ref" text,
	"content_type" text,
	"byte_size" integer,
	"duration_seconds" integer,
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_order_counters" (
	"year" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_order_number" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"job_type" text DEFAULT '' NOT NULL,
	"services" text DEFAULT '[]' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"lead_source" text DEFAULT 'manual' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"site_contact_name" text,
	"site_contact_phone" text,
	"address" text DEFAULT '' NOT NULL,
	"suburb" text,
	"city" text,
	"postcode" text,
	"location_notes" text,
	"access_notes" text,
	"scope_notes" text,
	"agreed_price" text,
	"scheduled_date" text,
	"scheduled_start_time" text,
	"scheduled_finish_time" text,
	"start_notes" text,
	"completion_notes" text,
	"started_at" text,
	"completed_at" text,
	"cancelled_reason" text,
	"cancelled_at" text,
	"created_by_user_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "jobs_job_order_number_unique" UNIQUE("job_order_number")
);
--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_media" ADD CONSTRAINT "job_media_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_media" ADD CONSTRAINT "job_media_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_assignments_job_idx" ON "job_assignments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_assignments_user_idx" ON "job_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_assignments_shift_idx" ON "job_assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "job_media_job_idx" ON "job_media" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_media_status_idx" ON "job_media" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_order_number_idx" ON "jobs" USING btree ("job_order_number");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_scheduled_date_idx" ON "jobs" USING btree ("scheduled_date");