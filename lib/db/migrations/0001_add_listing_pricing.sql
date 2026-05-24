ALTER TABLE "listings" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "printify_mockup_urls" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "price_rationale" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "printify_shop_id" text;
