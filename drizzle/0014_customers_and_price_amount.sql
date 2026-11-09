CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"customer_type" text DEFAULT 'residential' NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"archived_at" text,
	"created_by_user_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_series" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "job_series" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
ALTER TABLE "job_series" ADD CONSTRAINT "job_series_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("customer_id");