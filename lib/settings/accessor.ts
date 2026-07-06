// B-3.1 per-user settings. `settings` is now one row per user (unique user_id).
// These accessors replace the old `db.query.settings.findFirst()` singleton
// reads so every config lookup is tenant-scoped.

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings, users, batches, designs, listings, type Settings } from '@/lib/db/schema';

/** The user's settings row, creating a defaults row on first access. Never
 *  returns null. New-row id = max(id)+1 (rare path — one row per user). */
export async function getSettingsForUser(userId: string): Promise<Settings> {
  const existing = await db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  if (existing) return existing;

  const [{ maxId }] = await db.select({ maxId: sql<number>`coalesce(max(${settings.id}), 0)` }).from(settings);
  await db
    .insert(settings)
    .values({ id: Number(maxId) + 1, userId })
    .onConflictDoNothing({ target: settings.userId });
  const row = await db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  // Guaranteed present after insert-or-conflict.
  return row as Settings;
}

/** The founder's settings — used by cross-user background crons until per-user
 *  cron iteration lands (B-3.1b). Falls back to any row for a pre-B1 DB. */
export async function getFounderSettings(): Promise<Settings | undefined> {
  const founder = await db.query.users.findFirst({ where: eq(users.role, 'founder') });
  if (!founder) return db.query.settings.findFirst();
  return db.query.settings.findFirst({ where: eq(settings.userId, founder.id) });
}

/** Resolve settings via an owned entity — for by-id routes / workflow steps that
 *  have an entity id but no user in scope. Null when the entity or owner is
 *  missing (callers already null-check settings). */
export async function getSettingsForBatch(batchId: string): Promise<Settings | null> {
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  return batch?.userId ? getSettingsForUser(batch.userId) : null;
}

export async function getSettingsForDesign(designId: string): Promise<Settings | null> {
  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  return design ? getSettingsForBatch(design.batchId) : null;
}

export async function getSettingsForListing(listingId: string): Promise<Settings | null> {
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  return listing?.userId ? getSettingsForUser(listing.userId) : null;
}
