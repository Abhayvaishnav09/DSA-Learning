CREATE TABLE "current_version" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"checksum" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"note" text NOT NULL,
	"submission_id" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "current_version" ADD CONSTRAINT "current_version_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE no action ON UPDATE no action;