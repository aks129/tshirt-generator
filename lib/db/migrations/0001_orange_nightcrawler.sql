CREATE TABLE "printify_catalog_cache" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"blueprints" jsonb NOT NULL,
	"providers" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "edited_by_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "printify_setup_at" timestamp with time zone;