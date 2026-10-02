CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"source" text NOT NULL,
	"hint_level" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"content_version" integer NOT NULL,
	"misconception" text,
	"solution_shown" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attempts_by_user" ON "attempts" USING btree ("user_id","created_at" DESC NULLS LAST);