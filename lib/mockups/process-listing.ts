import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthExpired, EtsyAuthNotConnected, EtsyUploadError } from '@/lib/etsy/errors';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { fetchPrintifyMockups, downloadMockup, type PrintifyMockup } from '@/lib/mockups/printify-mockups';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

// Etsy's auto-published Printify mockup occupies rank 1, so our extras start
// at rank 2. We upload up to 9 → final listing has up to 10 photos.
const RANK_OFFSET = 2;

export type ProcessResult =
  | { ok: true; uploadedCount: number; failures: string[] }
  | { ok: false; errorCode: string; status: number; message: string };

export async function processListingPhotos(
  listingId: string,
  opts: { force?: boolean } = {},
): Promise<ProcessResult> {
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!listing) return { ok: false, errorCode: 'NOT_FOUND', status: 404, message: 'Listing not found' };
  if (!listing.etsyListingId) return { ok: false, errorCode: 'NOT_ON_ETSY', status: 400, message: 'Listing not yet on Etsy' };
  if (!listing.printifyProductId) return { ok: false, errorCode: 'NO_PRINTIFY_PRODUCT', status: 400, message: 'Listing has no Printify product' };
  if (listing.status !== 'live') return { ok: false, errorCode: 'NOT_LIVE', status: 400, message: `Listing status is ${listing.status}` };
  if (listing.photosUploadedAt && !opts.force) {
    return { ok: false, errorCode: 'ALREADY_UPLOADED', status: 409, message: 'Photos already uploaded' };
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design) return { ok: false, errorCode: 'NO_DESIGN', status: 400, message: 'Design not found' };

  let accessToken: string;
  try {
    accessToken = await getEtsyAccessToken();
  } catch (err) {
    if (err instanceof EtsyAuthNotConnected) return { ok: false, errorCode: 'NOT_CONNECTED', status: 400, message: 'Etsy not connected' };
    if (err instanceof EtsyAuthExpired) return { ok: false, errorCode: 'AUTH_EXPIRED', status: 401, message: 'Etsy authorization expired' };
    return { ok: false, errorCode: 'AUTH_ERROR', status: 502, message: err instanceof Error ? err.message : String(err) };
  }

  const s = await db.query.settings.findFirst();
  const shopId = s?.etsyShopIdOauth;
  if (!shopId) return { ok: false, errorCode: 'NO_SHOP', status: 400, message: 'No Etsy shop on connected account' };

  const preferredLabels = (s.mockupSelection as { labels?: string[] } | null)?.labels;
  let mockups: PrintifyMockup[];
  try {
    mockups = await fetchPrintifyMockups(listing.printifyProductId, { preferredLabels });
  } catch (err) {
    return { ok: false, errorCode: 'PRINTIFY_FETCH_FAILED', status: 502, message: err instanceof Error ? err.message : String(err) };
  }

  if (mockups.length === 0) {
    return { ok: false, errorCode: 'NO_MOCKUPS', status: 400, message: 'Printify product has no extra mockups' };
  }

  const sloganBase = (design.concept as Concept).headline.replace(/[^\w\s-]+/g, '').trim().slice(0, 60);

  const failures: string[] = [];
  let uploaded = 0;
  let rank = RANK_OFFSET;

  for (const mockup of mockups) {
    const filename = `${design.id}_${mockup.cameraLabel || `m${rank}`}.jpg`;
    const altText = `${sloganBase} — ${mockup.cameraLabel || 'mockup'}`;

    let buffer: Buffer;
    try {
      buffer = await downloadMockup(mockup.src);
    } catch (err) {
      failures.push(`${mockup.cameraLabel}: download — ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      rank++;
      continue;
    }

    const tryUpload = async () => {
      await uploadEtsyListingImage({
        accessToken, shopId, listingId: listing.etsyListingId!,
        imageBuffer: buffer, filename, rank, altText,
      });
    };

    try {
      await tryUpload();
      uploaded++;
    } catch (err) {
      const status = err instanceof EtsyUploadError ? err.status : 0;
      if (status === 401) {
        try {
          accessToken = await getEtsyAccessToken();
          await tryUpload();
          uploaded++;
        } catch (err2) {
          failures.push(`${mockup.cameraLabel}: ${err2 instanceof Error ? err2.message : String(err2)}`.slice(0, 200));
        }
      } else if (status === 429 || status >= 500) {
        await new Promise((r) => setTimeout(r, status === 429 ? 5000 : 2000));
        try {
          await tryUpload();
          uploaded++;
        } catch (err2) {
          failures.push(`${mockup.cameraLabel}: ${err2 instanceof Error ? err2.message : String(err2)}`.slice(0, 200));
        }
      } else {
        failures.push(`${mockup.cameraLabel}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      }
    }
    rank++;
  }

  await db.update(listings).set({
    photosUploadedAt: new Date(),
    photosCount: uploaded,
    photosFailureReason: failures.length ? failures.join(' | ').slice(0, 500) : null,
  }).where(eq(listings.id, listingId));

  await logEvent({
    type: uploaded > 0 ? 'generated' : 'publish_failed',
    designId: listing.designId,
    batchId: design.batchId,
    payload: { kind: 'mockups_uploaded', count: uploaded, total: mockups.length, failures },
  });

  return { ok: true, uploadedCount: uploaded, failures };
}
