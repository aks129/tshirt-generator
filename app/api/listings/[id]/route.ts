import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await db.query.listings.findFirst({ where: eq(listings.id, id) });
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
