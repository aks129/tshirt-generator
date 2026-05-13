import {
  pgTable, uuid, text, integer, jsonb, boolean, timestamp, pgEnum,
} from 'drizzle-orm/pg-core';

export const batchStatusEnum = pgEnum('batch_status', [
  'generating', 'ready', 'completed', 'failed',
]);

export const designStatusEnum = pgEnum('design_status', [
  'generating', 'pending_review', 'approved', 'rejected',
  'publishing', 'live', 'failed',
]);

export const listingStatusEnum = pgEnum('listing_status', [
  'publishing', 'publishing_slow', 'live', 'failed',
]);

export const designStyleEnum = pgEnum('design_style', [
  'typography', 'illustration', 'vintage',
]);

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  prompt: text('prompt').notNull(),
  nicheTag: text('niche_tag'),
  styles: text('styles').array().notNull(),
  requestedCount: integer('requested_count').notNull(),
  status: batchStatusEnum('status').notNull().default('generating'),
  workflowRunId: text('workflow_run_id'),
});

export const designs = pgTable('designs', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').references(() => batches.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  style: designStyleEnum('style').notNull(),
  concept: jsonb('concept').notNull(),
  imageBlobUrl: text('image_blob_url'),
  mockupBlobUrl: text('mockup_blob_url'),
  status: designStatusEnum('status').notNull().default('generating'),
  modelUsed: text('model_used'),
  generationCostCents: integer('generation_cost_cents').notNull().default(0),
  safetyFlags: text('safety_flags').array().notNull().default([]),
  failureReason: text('failure_reason'),
});

export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  designId: uuid('design_id').references(() => designs.id).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').array().notNull(),
  printifyProductId: text('printify_product_id'),
  etsyListingId: text('etsy_listing_id'),
  status: listingStatusEnum('status').notNull().default('publishing'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  safetyBlocked: boolean('safety_blocked').notNull().default(false),
  editedByUser: boolean('edited_by_user').notNull().default(false),
});

export const nicheLibrary = pgTable('niche_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  defaultStyles: text('default_styles').array().notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  dailyGenerationCap: integer('daily_generation_cap').notNull().default(50),
  dailyPublishCap: integer('daily_publish_cap').notNull().default(15),
  dailyBudgetCents: integer('daily_budget_cents').notNull().default(500),
  defaultPrintifyBlueprintId: integer('default_printify_blueprint_id'),
  defaultPrintProviderId: integer('default_print_provider_id'),
  defaultVariants: jsonb('default_variants'),
  etsyShopId: text('etsy_shop_id'),
  killSwitchActive: boolean('kill_switch_active').notNull().default(false),
  printifySetupAt: timestamp('printify_setup_at', { withTimezone: true }),
});

export const generationEvents = pgTable('generation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  designId: uuid('design_id').references(() => designs.id),
  batchId: uuid('batch_id').references(() => batches.id),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const printifyCatalogCache = pgTable('printify_catalog_cache', {
  id: integer('id').primaryKey().default(1),
  blueprints: jsonb('blueprints').notNull(),
  providers: jsonb('providers').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PrintifyCatalogCache = typeof printifyCatalogCache.$inferSelect;

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type Design = typeof designs.$inferSelect;
export type NewDesign = typeof designs.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Niche = typeof nicheLibrary.$inferSelect;
export type Settings = typeof settings.$inferSelect;
