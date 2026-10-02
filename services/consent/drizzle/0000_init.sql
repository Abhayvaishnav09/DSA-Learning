CREATE TABLE "deletion_steps" (
	"request_id" uuid NOT NULL,
	"service" text NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "deletion_steps_request_id_service_pk" PRIMARY KEY("request_id","service")
);
--> statement-breakpoint
CREATE TABLE "deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_name" text NOT NULL,
	"parent_email" text NOT NULL,
	"locale" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "deletion_steps" ADD CONSTRAINT "deletion_steps_request_id_deletions_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."deletions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_user" ON "requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requests_listing" ON "requests" USING btree ("requested_at" DESC NULLS LAST,"id" DESC NULLS LAST);