import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs, listingStats } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';
import { deletePrintifyProduct } from '@/lib/printify/delete-product';
import { requireOwnedListing } from '@/lib/auth/ownership';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await requireOwnedListing(req, id);
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });

  if ((row.status === 'publishing' || row.status === 'publishing_slow') && row.printifyProductId) {
    try {
      const status = await getProduct(row.printifyProductId);
      if (status.etsyListingId && status.etsyUrl) {
        await db
          .update(listings)
          .set({
            etsyListingId: status.etsyListingId,
            status: 'live',
            publishedAt: new Date(),
          })
          .where(eq(listings.id, id));
        return NextResponse.json({
          ok: true,
          listing: { ...row, etsyListingId: status.etsyListingId, status: 'live' },
          etsyUrl: status.etsyUrl,
        });
      }
    } catch {
      /* fall through to returning current state */
    }
  }

  return NextResponse.json({ ok: true, listing: row });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await requireOwnedListing(req, id);
  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  // Allow live deletes — the UI confirms the caller knows it won't unlist
  // from Etsy. Best-effort Printify delete will 404 cleanly if already gone.
  let printifyDeleted = false;
  let printifyError: string | null = null;
  if (row.printifyProductId) {
    try {
      printifyDeleted = await deletePrintifyProduct(row.printifyProductId);
    } catch (err) {
      printifyError = err instanceof Error ? err.message : String(err);
    }
  }

  // Stats snapshots FK-reference the listing (no cascade) — clear them first
  // or the row delete 500s for any listing the daily stats cron has touched.
  await db.delete(listingStats).where(eq(listingStats.listingId, id));
  await db.delete(listings).where(eq(listings.id, id));
  // Reset the design to 'approved' so it can be re-published.
  await db.update(designs).set({ status: 'approved' }).where(eq(designs.id, row.designId));

  return NextResponse.json({ ok: true, printifyDeleted, printifyError, wasLive: row.status === 'live' });
}
