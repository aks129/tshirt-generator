import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { listings, designs, customMockups } from '@/lib/db/schema';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthExpired, EtsyAuthNotConnected, EtsyUploadError } from '@/lib/etsy/errors';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { SCENES } from '@/lib/mockups/custom-mockup';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';
import { requireOwnedListing } from '@/lib/auth/ownership';
import { getSettingsForUser } from '@/lib/settings/accessor';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  mockupIds: z.array(z.string().uuid()).min(1).max(9),
  startingRank: z.number().int().min(2).max(10).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedListing(req, id))) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body', issues: parsed.error.format() }, { status: 400 });
  }

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 });
  if (!listing.etsyListingId) return NextResponse.json({ ok: false, error: 'Listing not yet on Etsy' }, { status: 400 });
  if (listing.status !== 'live') return NextResponse.json({ ok: false, error: `Listing is ${listing.status}` }, { status: 400 });
  const ownerId = listing.userId;
  if (!ownerId) return NextResponse.json({ ok: false, error: 'Listing has no owner' }, { status: 400 });

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design) return NextResponse.json({ ok: false, error: 'Design not found' }, { status: 404 });

  const mockups = await db
    .select()
    .from(customMockups)
    .where(inArray(customMockups.id, parsed.data.mockupIds));
  if (mockups.length === 0) {
    return NextResponse.json({ ok: false, error: 'No matching saved mockups' }, { status: 404 });
  }
  // All selected mockups must belong to this listing's design (sanity check).
  if (mockups.some((m) => m.designId !== listing.designId)) {
    return NextResponse.json({ ok: false, error: "Selected mockups don't all belong to this listing's design" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getEtsyAccessToken(ownerId);
  } catch (err) {
    if (err instanceof EtsyAuthNotConnected) return NextResponse.json({ ok: false, error: 'Etsy not connected' }, { status: 400 });
    if (err instanceof EtsyAuthExpired) return NextResponse.json({ ok: false, error: 'Etsy authorization expired' }, { status: 401 });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const s = await getSettingsForUser(ownerId);
  const shopId = s?.etsyShopIdOauth;
  if (!shopId) return NextResponse.json({ ok: false, error: 'No Etsy shop connected' }, { status: 400 });

  const sloganBase = (design.concept as Concept).headline.replace(/[^\w\s-]+/g, '').trim().slice(0, 60);
  const failures: string[] = [];
  let uploaded = 0;
  let rank = parsed.data.startingRank ?? 2;

  for (const m of mockups) {
    try {
      const blobResp = await fetch(m.blobUrl);
      if (!blobResp.ok) throw new Error(`Blob fetch ${blobResp.status}`);
      const buffer = Buffer.from(await blobResp.arrayBuffer());
      const scene = SCENES.find((sc) => sc.name === m.sceneName);
      const altText = `${sloganBase} — ${scene?.altText ?? m.sceneName}`;

      const result = await uploadEtsyListingImage({
        accessToken, shopId, listingId: listing.etsyListingId!,
        imageBuffer: buffer,
        filename: `${design.id}_${m.sceneName}.jpg`,
        rank,
        altText,
      });
      await db.update(customMockups).set({
        uploadedToEtsyAt: new Date(),
        etsyImageId: String(result.listingImageId),
        etsyListingId: listing.etsyListingId,
      }).where(eq(customMockups.id, m.id));
      uploaded++;
    } catch (err) {
      const status = err instanceof EtsyUploadError ? err.status : 0;
      failures.push(`${m.sceneName} (${status}): ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
    rank++;
  }

  await logEvent({
    type: uploaded > 0 ? 'generated' : 'publish_failed',
    designId: listing.designId,
    batchId: design.batchId,
    payload: { kind: 'custom_mockups_reuploaded', count: uploaded, requested: mockups.length, failures },
  });

  return NextResponse.json({
    ok: uploaded > 0,
    uploadedCount: uploaded,
    total: mockups.length,
    failures: failures.length ? failures : undefined,
  });
}
