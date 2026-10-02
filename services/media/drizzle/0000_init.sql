CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"alt" text NOT NULL,
	"blur_data_url" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "variants_asset_id_name_pk" PRIMARY KEY("asset_id","name")
);
--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_created" ON "assets" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assets_owner" ON "assets" USING btree ("uploaded_by");