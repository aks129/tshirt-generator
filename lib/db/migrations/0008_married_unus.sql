CREATE TABLE "shirt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"blueprint_id" integer NOT NULL,
	"provider_id" integer,
	"variant_ids" integer[] DEFAULT '{}' NOT NULL,
	"color_name" text,
	"color_hex" text,
	"blank_image_url" text NOT NULL,
	"print_area" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
