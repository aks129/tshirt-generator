import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { db } from '@/lib/db/client';
import { listings, designs, customMockups } from '@/lib/db/schema';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthExpired, EtsyAuthNotConnected, EtsyUploadError } from '@/lib/etsy/errors';
import { generateCustomMockupSet } from '@/lib/mockups/custom-mockup';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { fetchConfiguredTones, type ShirtTone } from '@/lib/printify/variant-colors';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';
import { requireOwnedListing } from '@/lib/auth/ownership';

export const runtime = 'nodejs';
// Recraft generation can run 8-12s per image. 3 in parallel + composites +
// Blob saves + Etsy uploads can push toward 50-60s. Bump to 90s to be safe.
export const maxDuration = 90;

const CUSTOM_RANK_START = 2;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedListing(req, id))) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  const url = new URL(req.url);
  // When true, only generate + persist to Blob; skip Etsy upload. Useful for
  // 'just save for later' flows.
  const saveOnly = url.searchParams.get('save_only') === 'true';

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 });
  if (!saveOnly && !listing.etsyListingId) {
    return NextResponse.json({ ok: false, error: 'Listing not yet on Etsy' }, { status: 400 });
  }
  if (!saveOnly && listing.status !== 'live') {
    return NextResponse.json({ ok: false, error: `Listing status is ${listing.status}, not live` }, { status: 400 });
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design?.imageBlobUrl) {
    return NextResponse.json({ ok: false, error: 'Design has no image' }, { status: 400 });
  }

  const sloganBase = (design.concept as Concept).headline.replace(/[^\w\s-]+/g, '').trim().slice(0, 60);

  // Derive the shirt tones the seller actually offers from the master product,
  // so dark-shirt sellers get dark-shirt mockups. Non-blocking: any failure
  // leaves tones undefined and the generator falls back to light scenes.
  let tones: Set<ShirtTone> | undefined;
  try {
    const cfg = await db.query.settings.findFirst();
    if (cfg?.masterPrintifyProductId) {
      const master = await fetchMasterProduct(cfg.masterPrintifyProductId);
      tones = await fetchConfiguredTones({
        blueprintId: master.blueprintId,
        providerId: master.printProviderId,
        variantIds: master.variants.map((v) => v.id),
      });
    }
  } catch {
    /* fall back to light default */
  }

  let mockups;
  try {
    mockups = await generateCustomMockupSet({
      designBlobUrl: design.imageBlobUrl,
      designId: design.id,
      tones,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Persist every generated mockup to Blob + DB. Even if Etsy upload fails
  // (or we're in save_only mode), the mockups remain reusable.
  const saved: Array<{ id: string; scene: typeof mockups[number]['scene']; buffer: Buffer; blobUrl: string }> = [];
  for (const { scene, buffer } of mockups) {
    const path = `custom-mockups/${design.id}/${Date.now()}_${scene.name}.jpg`;
    const blob = await put(path, buffer, { access: 'public', contentType: 'image/jpeg' });
    const [row] = await db.insert(customMockups).values({
      designId: design.id,
      sceneName: scene.name,
      blobUrl: blob.url,
    }).returning();
    saved.push({ id: row.id, scene, buffer, blobUrl: blob.url });
  }

  if (saveOnly) {
    await logEvent({
      type: 'generated',
      designId: listing.designId,
      batchId: design.batchId,
      payload: { kind: 'custom_mockups_saved', count: saved.length },
    });
    return NextResponse.json({
      ok: true,
      savedCount: saved.length,
      mockups: saved.map((s) => ({ id: s.id, sceneName: s.scene.name, blobUrl: s.blobUrl })),
    });
  }

  // Upload to Etsy
  let accessToken: string;
  try {
    accessToken = await getEtsyAccessToken();
  } catch (err) {
    if (err instanceof EtsyAuthNotConnected) {
      return NextResponse.json({
        ok: false,
        savedCount: saved.length,
        error: 'Etsy not connected — mockups saved, upload via the gallery later',
      }, { status: 400 });
    }
    if (err instanceof EtsyAuthExpired) {
      return NextResponse.json({
        ok: false,
        savedCount: saved.length,
        error: 'Etsy authorization expired — mockups saved, reconnect in /settings',
      }, { status: 401 });
    }
    return NextResponse.json({
      ok: false,
      savedCount: saved.length,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 502 });
  }

  const s = await db.query.settings.findFirst();
  const shopId = s?.etsyShopIdOauth;
  if (!shopId) {
    return NextResponse.json({
      ok: false,
      savedCount: saved.length,
      error: 'No Etsy shop on connected account — mockups saved, reupload from gallery',
    }, { status: 400 });
  }

  const failures: string[] = [];
  let uploaded = 0;
  let rank = CUSTOM_RANK_START;

  for (const { id: mockupId, scene, buffer } of saved) {
    try {
      const result = await uploadEtsyListingImage({
        accessToken, shopId, listingId: listing.etsyListingId!,
        imageBuffer: buffer,
        filename: `${design.id}_${scene.name}.jpg`,
        rank,
        altText: `${sloganBase} — ${scene.altText}`,
      });
      await db.update(customMockups).set({
        uploadedToEtsyAt: new Date(),
        etsyImageId: String(result.listingImageId),
        etsyListingId: listing.etsyListingId,
      }).where(eq(customMockups.id, mockupId));
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
      saved: saved.length,
      failures,
    },
  });

  return NextResponse.json({
    ok: uploaded > 0 || saved.length > 0,
    savedCount: saved.length,
    uploadedCount: uploaded,
    total: mockups.length,
    failures: failures.length ? failures : undefined,
  });
}
