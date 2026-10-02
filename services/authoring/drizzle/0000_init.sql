CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"comment" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_version" text,
	"submitted_at" timestamp with time zone,
	"published_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_snapshot" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"bundle" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_draft_idx" ON "activity" USING btree ("draft_id","at");--> statement-breakpoint
CREATE INDEX "drafts_author_idx" ON "drafts" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "drafts_status_idx" ON "drafts" USING btree ("status","updated_at");