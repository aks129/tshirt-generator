CREATE TYPE "public"."batch_status" AS ENUM('generating', 'ready', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('generating', 'pending_review', 'approved', 'rejected', 'publishing', 'live', 'failed');--> statement-breakpoint
CREATE TYPE "public"."design_style" AS ENUM('typography', 'illustration', 'vintage');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('publishing', 'publishing_slow', 'live', 'failed');--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prompt" text NOT NULL,
	"niche_tag" text,
	"styles" text[] NOT NULL,
	"requested_count" integer NOT NULL,
	"status" "batch_status" DEFAULT 'generating' NOT NULL,
	"workflow_run_id" text
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"style" "design_style" NOT NULL,
	"concept" jsonb NOT NULL,
	"image_blob_url" text,
	"mockup_blob_url" text,
	"status" "design_status" DEFAULT 'generating' NOT NULL,
	"model_used" text,
	"generation_cost_cents" integer DEFAULT 0 NOT NULL,
	"safety_flags" text[] DEFAULT '{}' NOT NULL,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "generation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid,
	"batch_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tags" text[] NOT NULL,
	"printify_product_id" text,
	"etsy_listing_id" text,
	"status" "listing_status" DEFAULT 'publishing' NOT NULL,
	"published_at" timestamp with time zone,
	"failure_reason" text,
	"safety_blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "listings_design_id_unique" UNIQUE("design_id")
);
--> statement-breakpoint
CREATE TABLE "niche_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"prompt_template" text NOT NULL,
	"default_styles" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "niche_library_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"daily_generation_cap" integer DEFAULT 50 NOT NULL,
	"daily_publish_cap" integer DEFAULT 15 NOT NULL,
	"daily_budget_cents" integer DEFAULT 500 NOT NULL,
	"default_printify_blueprint_id" integer,
	"default_print_provider_id" integer,
	"default_variants" jsonb,
	"etsy_shop_id" text,
	"kill_switch_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;