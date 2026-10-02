CREATE TABLE "badges" (
	"user_id" uuid NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stats" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "totals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"week_start" date NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "xp_ledger_user_week" ON "xp_ledger" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "xp_ledger_recent" ON "xp_ledger" USING btree ("user_id","id" DESC NULLS LAST);