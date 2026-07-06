// B-2.2 mutation guards: resolve the request user and confirm they own the
// target row before a by-id route acts on it. Returns the row when owned, or
// null (caller responds 404 — don't reveal that the row exists to non-owners).
//
// Designs carry no user_id — ownership flows through their batch. Listings and
// batches carry user_id directly (backfilled to the founder in B-1, stamped on
// every new write).

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { batches, designs, listings, type Batch, type Design, type Listing } from '@/lib/db/schema';
import { getRequestUser } from './current-user';

export async function requireOwnedBatch(req: Request, batchId: string): Promise<Batch | null> {
  const user = await getRequestUser(req);
  if (!user) return null;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  return batch && batch.userId === user.id ? batch : null;
}

export async function requireOwnedDesign(req: Request, designId: string): Promise<Design | null> {
  const user = await getRequestUser(req);
  if (!user) return null;
  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return null;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, design.batchId) });
  return batch && batch.userId === user.id ? design : null;
}

export async function requireOwnedListing(req: Request, listingId: string): Promise<Listing | null> {
  const user = await getRequestUser(req);
  if (!user) return null;
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  return listing && listing.userId === user.id ? listing : null;
}
