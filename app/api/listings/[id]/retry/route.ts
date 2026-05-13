import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { runPublish } from '@/lib/publish/publish-design';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  if (listing.status === 'live') {
    return NextResponse.json({ ok: true, status: 'live', listing });
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design?.imageBlobUrl) {
    return NextResponse.json({ ok: false, error: 'Design image missing' }, { status: 400 });
  }
  const s = await db.query.settings.findFirst();
  if (!s?.defaultPrintifyBlueprintId || !s?.defaultPrintProviderId || !s?.defaultVariants) {
    return NextResponse.json({ ok: false, error: 'Printify not configured' }, { status: 400 });
  }

  await db.update(listings).set({ status: 'publishing', failureReason: null }).where(eq(listings.id, id));

  try {
    const result = await runPublish({
      designImageUrl: design.imageBlobUrl,
      fileName: `design_${listing.designId}.png`,
      blueprintId: s.defaultPrintifyBlueprintId,
      printProviderId: s.defaultPrintProviderId,
      variantIds: (s.defaultVariants as { variantIds: number[] }).variantIds,
      title: listing.title,
      description: listing.description,
      tags: listing.tags,
      preCreatedProductId: listing.printifyProductId ?? undefined,
    });

    if (result.status === 'live') {
      await db
        .update(listings)
        .set({
          printifyProductId: result.printifyProductId,
          etsyListingId: result.etsyListingId,
          status: 'live',
          publishedAt: new Date(),
        })
        .where(eq(listings.id, id));
      await db.update(designs).set({ status: 'live' }).where(eq(designs.id, listing.designId));
      await logEvent({
        type: 'published',
        designId: listing.designId,
        batchId: design.batchId,
        payload: { retry: true, etsyListingId: result.etsyListingId },
      });
      return NextResponse.json({ ok: true, status: 'live', etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl });
    } else {
      await db
        .update(listings)
        .set({ printifyProductId: result.printifyProductId, status: 'publishing_slow' })
        .where(eq(listings.id, id));
      return NextResponse.json({ ok: true, status: 'publishing_slow' }, { status: 202 });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.update(listings).set({ status: 'failed', failureReason: reason.slice(0, 500) }).where(eq(listings.id, id));
    return NextResponse.json({ ok: false, error: reason }, { status: 502 });
  }
}
