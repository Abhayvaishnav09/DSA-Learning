CREATE TABLE "attempt_facts" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"hint_level" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"misconception" text,
	"source" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_completions" (
	"user_id" uuid NOT NULL,
	"concept_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_completions_user_id_concept_id_pk" PRIMARY KEY("user_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attempt_facts_at" ON "attempt_facts" USING btree ("at");--> statement-breakpoint
CREATE INDEX "attempt_facts_item" ON "attempt_facts" USING btree ("item_id","user_id","at");--> statement-breakpoint
CREATE INDEX "attempt_facts_user" ON "attempt_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_completions_at" ON "lesson_completions" USING btree ("at");