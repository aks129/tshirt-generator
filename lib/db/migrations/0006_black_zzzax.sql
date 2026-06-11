CREATE TABLE "custom_mockups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"scene_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"uploaded_to_etsy_at" timestamp with time zone,
	"etsy_image_id" text,
	"etsy_listing_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_mockups" ADD CONSTRAINT "custom_mockups_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;