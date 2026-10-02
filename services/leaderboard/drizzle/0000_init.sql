CREATE TABLE "history" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"tier" text NOT NULL,
	"rank" integer NOT NULL,
	"xp" integer NOT NULL,
	"result" text NOT NULL,
	CONSTRAINT "history_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settled_weeks" (
	"week_start" date PRIMARY KEY NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_xp" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "weekly_xp_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
CREATE INDEX "members_group" ON "members" USING btree ("tier","joined_at","user_id");--> statement-breakpoint
CREATE INDEX "weekly_xp_week" ON "weekly_xp" USING btree ("week_start");