CREATE TABLE "card_due" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	CONSTRAINT "card_due_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "mails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"user_id" uuid,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	CONSTRAINT "mails_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"review_reminders" boolean DEFAULT true NOT NULL,
	"weekly_summary" boolean DEFAULT true NOT NULL,
	"product_news" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_reminded_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "card_due_when" ON "card_due" USING btree ("due");--> statement-breakpoint
CREATE INDEX "mails_queue" ON "mails" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_inbox" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);