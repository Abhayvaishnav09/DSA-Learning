CREATE TABLE "applied_attempts" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"outcome" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"daily_goal_minutes" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "applied_attempts_when" ON "applied_attempts" USING btree ("applied_at");