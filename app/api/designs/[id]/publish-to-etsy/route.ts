import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs, listings, settings } from '@/lib/db/schema';
import { logEvent } from '@/lib/events';
import { publishProductToChannel } from '@/lib/printify/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Triggers Printify to push an already-created product to the shop's
// connected sales channel (Etsy in your case). Printify owns the OAuth.
// Pre-req: design has been pushed to Printify via /publish first.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const design = await db.query.designs.findFirst({ where: eq(designs.id, id) });
    if (!design) return NextResponse.json({ ok: false, error: 'design not found' }, { status: 404 });

    const [listing] = await db.select().from(listings).where(eq(listings.designId, id));
    if (!listing?.printifyProductId) {
      return NextResponse.json(
        { ok: false, error: 'Design has not been published to Printify yet. Click "Publish to Printify" first.' },
        { status: 400 },
      );
    }

    // Pre-flight checklist: refuse to ship a half-built listing to Etsy.
    const problems: string[] = [];
    if (!listing.priceCents || listing.priceCents < 500) problems.push('price missing or below $5');
    if (listing.printifyMockupUrls.length === 0) problems.push('no mockups');
    if (!listing.description || listing.description.length < 40) problems.push('description too short');
    if (listing.tags.length < 10) problems.push(`only ${listing.tags.length} tags (need ≥10)`);
    if (problems.length) {
      return NextResponse.json(
        { ok: false, error: `Checklist failed: ${problems.join(', ')}` },
        { status: 400 },
      );
    }

    const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
    if (!cfg?.printifyShopId) {
      return NextResponse.json({ ok: false, error: 'No Printify shop configured' }, { status: 400 });
    }

    await publishProductToChannel({
      shopId: Number(cfg.printifyShopId),
      productId: listing.printifyProductId,
    });

    // Printify pushes asynchronously — mark as publishing_slow so the UI keeps
    // polling for the etsy_listing_id (set via Printify webhook in a follow-up).
    await db
      .update(listings)
      .set({ status: 'publishing_slow', publishedAt: new Date() })
      .where(eq(listings.designId, id));

    await db.update(designs).set({ status: 'publishing' }).where(eq(designs.id, id));

    await logEvent({
      type: 'published_to_etsy',
      designId: id,
      batchId: design.batchId,
      payload: { printifyProductId: listing.printifyProductId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent({ type: 'etsy_publish_failed', designId: id, payload: { error: msg } });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
