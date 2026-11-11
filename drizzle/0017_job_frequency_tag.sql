ALTER TABLE "job_series" ADD COLUMN "job_frequency" text;--> statement-breakpoint
ALTER TABLE "job_series" ADD COLUMN "job_frequency_note" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "frequency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "frequency_note" text;