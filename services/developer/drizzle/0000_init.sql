CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"daily_quota" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"birth_year" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_usage" (
	"key_id" uuid NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_key_usage_key_id_day_pk" PRIMARY KEY("key_id","day")
);
--> statement-breakpoint
ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_owner" ON "api_keys" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "api_keys_created" ON "api_keys" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);