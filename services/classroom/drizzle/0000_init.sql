CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "learner_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"concepts_mastered" integer DEFAULT 0 NOT NULL,
	"last_active_on" date
);
--> statement-breakpoint
CREATE TABLE "members" (
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_class_id_user_id_pk" PRIMARY KEY("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_xp" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "weekly_xp_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_owner" ON "classes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "classes_created" ON "classes" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "members_user" ON "members" USING btree ("user_id");