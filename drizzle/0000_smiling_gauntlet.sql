CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"actor_role" text,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" text,
	"ip_address" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"latest_version_id" text,
	"manager_reviewed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"is_manager_entered" boolean DEFAULT false NOT NULL,
	"manager_reason" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"type" text NOT NULL,
	"start_time" text,
	"finish_time" text,
	"is_overnight" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" text NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "roster_draft_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"roster_week_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_datetime" text NOT NULL,
	"finish_datetime" text NOT NULL,
	"start_day_of_week" integer NOT NULL,
	"label" text,
	"notes" text,
	"override_reason" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_version_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"roster_version_id" text NOT NULL,
	"user_id" text NOT NULL,
	"staff_name_snapshot" text NOT NULL,
	"start_datetime" text NOT NULL,
	"finish_datetime" text NOT NULL,
	"start_day_of_week" integer NOT NULL,
	"label" text,
	"notes" text,
	"override_reason" text,
	"response_status" text DEFAULT 'pending' NOT NULL,
	"response_reason" text,
	"response_note" text,
	"responded_at" text
);
--> statement-breakpoint
CREATE TABLE "roster_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"roster_week_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"published_by_user_id" text NOT NULL,
	"published_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start_date" text NOT NULL,
	"draft_revision_number" integer DEFAULT 1 NOT NULL,
	"latest_published_version_id" text,
	"updated_at" text NOT NULL,
	CONSTRAINT "roster_weeks_week_start_date_unique" UNIQUE("week_start_date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"password_version" integer DEFAULT 1 NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_event_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_report_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"location_name" text,
	"photo_url" text,
	"notes" text,
	"timestamp" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"roster_version_shift_id" text,
	"shift_date" text NOT NULL,
	"week_start_date" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"clock_in_at" text NOT NULL,
	"clock_in_photo" text,
	"clock_in_type" text DEFAULT 'base_arrival' NOT NULL,
	"clock_in_location" text,
	"clock_out_at" text,
	"clock_out_photo" text,
	"clock_out_type" text,
	"clock_out_location" text,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"travel_minutes" integer DEFAULT 0 NOT NULL,
	"worked_with" text,
	"staff_notes" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_worked_minutes" integer DEFAULT 0 NOT NULL,
	"manager_override_start_at" text,
	"manager_override_finish_at" text,
	"manager_override_break_minutes" integer,
	"manager_override_reason" text,
	"manager_overridden_by_id" text,
	"manager_overridden_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_roster_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"shift_id" text,
	"response_status" text NOT NULL,
	"reason" text,
	"note" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_roster_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"roster_version_id" text NOT NULL,
	"user_id" text NOT NULL,
	"has_shifts" boolean NOT NULL,
	"shift_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"response_status" text DEFAULT 'pending' NOT NULL,
	"response_reason" text,
	"response_note" text,
	"responded_at" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "weekly_timesheets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"staff_signed_name" text,
	"staff_signed_at" text,
	"supervisor_signed_name" text,
	"supervisor_signed_at" text,
	"supervisor_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_worked_hours" text DEFAULT '0.0' NOT NULL,
	"manager_notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_reports" ADD CONSTRAINT "availability_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_versions" ADD CONSTRAINT "availability_versions_report_id_availability_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."availability_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_versions" ADD CONSTRAINT "availability_versions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_version_id_availability_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."availability_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_draft_shifts" ADD CONSTRAINT "roster_draft_shifts_roster_week_id_roster_weeks_id_fk" FOREIGN KEY ("roster_week_id") REFERENCES "public"."roster_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_draft_shifts" ADD CONSTRAINT "roster_draft_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_version_shifts" ADD CONSTRAINT "roster_version_shifts_roster_version_id_roster_versions_id_fk" FOREIGN KEY ("roster_version_id") REFERENCES "public"."roster_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_version_shifts" ADD CONSTRAINT "roster_version_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_versions" ADD CONSTRAINT "roster_versions_roster_week_id_roster_weeks_id_fk" FOREIGN KEY ("roster_week_id") REFERENCES "public"."roster_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_versions" ADD CONSTRAINT "roster_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_event_reports" ADD CONSTRAINT "shift_event_reports_shift_report_id_shift_reports_id_fk" FOREIGN KEY ("shift_report_id") REFERENCES "public"."shift_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_event_reports" ADD CONSTRAINT "shift_event_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_manager_overridden_by_id_users_id_fk" FOREIGN KEY ("manager_overridden_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster_responses" ADD CONSTRAINT "staff_roster_responses_snapshot_id_staff_roster_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."staff_roster_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster_responses" ADD CONSTRAINT "staff_roster_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster_snapshots" ADD CONSTRAINT "staff_roster_snapshots_roster_version_id_roster_versions_id_fk" FOREIGN KEY ("roster_version_id") REFERENCES "public"."roster_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roster_snapshots" ADD CONSTRAINT "staff_roster_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ADD CONSTRAINT "weekly_timesheets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ADD CONSTRAINT "weekly_timesheets_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_type_idx" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "avail_user_week_idx" ON "availability_reports" USING btree ("user_id","week_start_date");--> statement-breakpoint
CREATE INDEX "avail_ver_report_idx" ON "availability_versions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "avail_win_version_idx" ON "availability_windows" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "notifs_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "draft_shifts_week_idx" ON "roster_draft_shifts" USING btree ("roster_week_id");--> statement-breakpoint
CREATE INDEX "draft_shifts_user_idx" ON "roster_draft_shifts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "version_shifts_version_idx" ON "roster_version_shifts" USING btree ("roster_version_id");--> statement-breakpoint
CREATE INDEX "version_shifts_user_idx" ON "roster_version_shifts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roster_vers_week_idx" ON "roster_versions" USING btree ("roster_week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_week_date_idx" ON "roster_weeks" USING btree ("week_start_date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shift_events_report_idx" ON "shift_event_reports" USING btree ("shift_report_id");--> statement-breakpoint
CREATE INDEX "shift_events_user_idx" ON "shift_event_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shift_events_timestamp_idx" ON "shift_event_reports" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "shift_reports_user_date_idx" ON "shift_reports" USING btree ("user_id","shift_date");--> statement-breakpoint
CREATE INDEX "shift_reports_week_idx" ON "shift_reports" USING btree ("week_start_date");--> statement-breakpoint
CREATE INDEX "shift_reports_status_idx" ON "shift_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "responses_snapshot_idx" ON "staff_roster_responses" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "responses_user_idx" ON "staff_roster_responses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_snapshot_ver_user_idx" ON "staff_roster_snapshots" USING btree ("roster_version_id","user_id");--> statement-breakpoint
CREATE INDEX "staff_snapshot_user_idx" ON "staff_roster_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_timesheet_user_week_idx" ON "weekly_timesheets" USING btree ("user_id","week_start_date");--> statement-breakpoint
CREATE INDEX "weekly_timesheet_week_idx" ON "weekly_timesheets" USING btree ("week_start_date");