ALTER TABLE "listings" ADD COLUMN "photos_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "photos_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "photos_failure_reason" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "etsy_user_id" bigint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "etsy_shop_id_oauth" bigint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "etsy_access_token" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "etsy_refresh_token" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "etsy_token_expires_at" timestamp with time zone;
--> statement-breakpoint
-- Partial index for the cron's pending-photos query
CREATE INDEX idx_listings_pending_photos
  ON listings(status, photos_uploaded_at, created_at)
  WHERE status = 'live' AND photos_uploaded_at IS NULL;