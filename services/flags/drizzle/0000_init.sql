CREATE TABLE "flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean NOT NULL,
	"rollout_percent" integer DEFAULT 100 NOT NULL,
	"roles" text[] DEFAULT '{}' NOT NULL,
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"min_app_version" text,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
