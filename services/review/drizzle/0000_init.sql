CREATE TABLE "cards" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"card" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cards_due" ON "cards" USING btree ("user_id","due");