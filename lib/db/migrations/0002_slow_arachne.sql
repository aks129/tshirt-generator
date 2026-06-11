CREATE TABLE "etsy_price_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"query_hash" text NOT NULL,
	"sample_count" integer NOT NULL,
	"min_cents" integer NOT NULL,
	"p25_cents" integer NOT NULL,
	"median_cents" integer NOT NULL,
	"p75_cents" integer NOT NULL,
	"max_cents" integer NOT NULL,
	"raw_prices" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	CONSTRAINT "etsy_price_samples_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "price_offset_cents" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "min_price_floor_cents" integer DEFAULT 1499 NOT NULL;