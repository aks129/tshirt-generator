import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthExpired, EtsyAuthNotConnected, EtsyUploadError } from '@/lib/etsy/errors';
import { generateCustomMockupSet } from '@/lib/mockups/custom-mockup';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export const runtime = 'nodejs';
// Recraft generation can run 8-12s per image. 3 in parallel + composites +
// Etsy uploads can push toward 45-55s. Bump to 90s to be safe.
export const maxDuration = 90;

const CUSTOM_RANK_START = 2;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 });
  if (!listing.etsyListingId) {
    return NextResponse.json({ ok: false, error: 'Listing not yet on Etsy' }, { status: 400 });
  }
  if (listing.status !== 'live') {
    return NextResponse.json({ ok: false, error: `Listing status is ${listing.status}, not live` }, { status: 400 });
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design?.imageBlobUrl) {
    return NextResponse.json({ ok: false, error: 'Design has no image' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getEtsyAccessToken();
  } catch (err) {
    if (err instanceof EtsyAuthNotConnected) {
      return NextResponse.json({ ok: false, error: 'Etsy not connected' }, { status: 400 });
    }
    if (err instanceof EtsyAuthExpired) {
      return NextResponse.json({ ok: false, error: 'Etsy authorization expired' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const s = await db.query.settings.findFirst();
  const shopId = s?.etsyShopIdOauth;
  if (!shopId) {
    return NextResponse.json({ ok: false, error: 'No Etsy shop on connected account' }, { status: 400 });
  }

  const sloganBase = (design.concept as Concept).headline.replace(/[^\w\s-]+/g, '').trim().slice(0, 60);

  let mockups;
  try {
    mockups = await generateCustomMockupSet({
      designBlobUrl: design.imageBlobUrl,
      designId: design.id,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const failures: string[] = [];
  let uploaded = 0;
  let rank = CUSTOM_RANK_START;

  for (const { scene, buffer } of mockups) {
    try {
      await uploadEtsyListingImage({
        accessToken, shopId, listingId: listing.etsyListingId,
        imageBuffer: buffer,
        filename: `${design.id}_${scene.name}.jpg`,
        rank,
        altText: `${sloganBase} — ${scene.altText}`,
      });
      uploaded++;
    } catch (err) {
      const status = err instanceof EtsyUploadError ? err.status : 0;
      failures.push(`${scene.name} (${status}): ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
    rank++;
  }

  await logEvent({
    type: uploaded > 0 ? 'generated' : 'publish_failed',
    designId: listing.designId,
    batchId: design.batchId,
    payload: {
      kind: 'custom_mockups_uploaded',
      count: uploaded,
      total: mockups.length,
      failures,
    },
  });

  return NextResponse.json({
    ok: uploaded > 0,
    uploadedCount: uploaded,
    total: mockups.length,
    failures: failures.length ? failures : undefined,
  });
}
