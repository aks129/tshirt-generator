import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthExpired, EtsyAuthNotConnected, EtsyUploadError } from '@/lib/etsy/errors';
import { composeFromBlobUrl } from '@/lib/mockups/compose';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { MOCKUP_BASES } from '@/public/mockup-bases/manifest';
import { fetchConfiguredColors } from '@/lib/printify/variant-colors';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

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
  if (listing.status !== 'live') return { ok: false, errorCode: 'NOT_LIVE', status: 400, message: `Listing status is ${listing.status}` };
  if (listing.photosUploadedAt && !opts.force) {
    return { ok: false, errorCode: 'ALREADY_UPLOADED', status: 409, message: 'Photos already uploaded' };
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, listing.designId) });
  if (!design?.imageBlobUrl) return { ok: false, errorCode: 'NO_IMAGE', status: 400, message: 'Design has no image' };

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

  // Filter mockup bases to only colors the operator actually sells, so we
  // don't upload e.g. black-tee mockups for a white-only product.
  let basesToCompose = MOCKUP_BASES;
  if (s.defaultPrintifyBlueprintId && s.defaultPrintProviderId && s.defaultVariants) {
    const variantIds = (s.defaultVariants as { variantIds?: number[] }).variantIds ?? [];
    const configuredColors = await fetchConfiguredColors({
      blueprintId: s.defaultPrintifyBlueprintId,
      providerId: s.defaultPrintProviderId,
      variantIds,
    });
    if (configuredColors.size > 0) {
      const filtered = MOCKUP_BASES.filter((b) => configuredColors.has(b.color));
      if (filtered.length > 0) basesToCompose = filtered;
    }
  }

  const sloganBase = (design.concept as Concept).headline.replace(/[^\w\s-]+/g, '').trim().slice(0, 60);

  const composites = await Promise.all(
    basesToCompose.map(async (base) => ({
      base,
      buffer: await composeFromBlobUrl({ base, designBlobUrl: design.imageBlobUrl! }),
    })),
  );

  const failures: string[] = [];
  let uploaded = 0;

  for (const { base, buffer } of composites) {
    const filename = `${design.id}_${base.id}.jpg`;
    const altText = `${sloganBase} — ${base.altText}`;
    const rank = base.id + RANK_OFFSET;

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
          failures.push(`base_${base.id}: ${err2 instanceof Error ? err2.message : String(err2)}`.slice(0, 200));
        }
      } else if (status === 429 || status >= 500) {
        await new Promise((r) => setTimeout(r, status === 429 ? 5000 : 2000));
        try {
          await tryUpload();
          uploaded++;
        } catch (err2) {
          failures.push(`base_${base.id}: ${err2 instanceof Error ? err2.message : String(err2)}`.slice(0, 200));
        }
      } else {
        failures.push(`base_${base.id}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      }
    }
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
    payload: { kind: 'mockups_uploaded', count: uploaded, total: basesToCompose.length, failures },
  });

  return { ok: true, uploadedCount: uploaded, failures };
}
