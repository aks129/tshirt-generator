import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs, listings } from '@/lib/db/schema';
import { checkSafety } from '@/lib/ai/content-safety';
import { runPublish } from '@/lib/publish/publish-design';
import { recommendPrice } from '@/lib/etsy/price-recommendation';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PublishOneCopy = { title: string; description: string; tags: string[] };

export type PublishOneResult = {
  ok: boolean;
  status?: 'live' | 'publishing_slow';
  listingId?: string;
  etsyListingId?: string;
  etsyUrl?: string;
  capReached?: boolean;
  error?: string;
};

export async function publishOneDesign(
  designId: string,
  copy: PublishOneCopy,
  opts: { overrideSafety?: boolean; priceCents?: number; resume?: boolean } = {},
): Promise<PublishOneResult> {
  const s = await db.query.settings.findFirst();
  if (!s) return { ok: false, error: 'Settings missing' };
  if (s.killSwitchActive) return { ok: false, error: 'Kill switch active' };
  if (!s.masterPrintifyProductId) return { ok: false, error: 'No master Printify product selected.' };

  const since = new Date(Date.now() - DAY_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(gte(listings.createdAt, since));
  if (count >= s.dailyPublishCap) {
    return { ok: false, capReached: true, error: `Daily publish cap reached (${count}/${s.dailyPublishCap})` };
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return { ok: false, error: 'Design not found' };
  if (!design.imageBlobUrl) return { ok: false, error: 'Design has no image' };

  const existing = await db.query.listings.findFirst({
    where: and(eq(listings.designId, designId), sql`status in ('publishing','publishing_slow','live')`),
  });
  let listingId: string;
  let preCreatedProductId: string | undefined;
  if (existing) {
    if (!opts.resume) return { ok: false, error: 'Design already published or publishing' };
    listingId = existing.id;
    preCreatedProductId = existing.printifyProductId ?? undefined;
  } else {
    if (!opts.overrideSafety) {
      const safety = await checkSafety({
        headline: (design.concept as Concept).headline,
        illustrationPrompt: 'n/a',
        title: copy.title,
        description: copy.description,
        tags: copy.tags,
      });
      if (safety.flags.length > 0) return { ok: false, error: `Content blocked: ${safety.flags.join(', ')}` };
    }
    const [row] = await db.insert(listings).values({
      designId, title: copy.title, description: copy.description, tags: copy.tags,
      status: 'publishing', editedByUser: true,
    }).returning();
    listingId = row.id;
  }

  await db.update(designs).set({ status: 'publishing' }).where(eq(designs.id, designId));

  let basePriceCents: number | null = null;
  if (typeof opts.priceCents === 'number') {
    basePriceCents = Math.max(opts.priceCents, s.minPriceFloorCents);
  } else {
    try {
      const rec = await recommendPrice({
        concept: {
          headline: (design.concept as Concept).headline,
          niche_keywords: (design.concept as Concept).niche_keywords ?? [],
        },
        settings: { priceOffsetCents: s.priceOffsetCents, minPriceFloorCents: s.minPriceFloorCents },
      });
      if (rec.source !== 'unavailable' && typeof rec.recommendedCents === 'number') {
        basePriceCents = rec.recommendedCents;
      }
    } catch { /* non-blocking — master prices win */ }
  }

  try {
    const result = await runPublish({
      designImageUrl: design.imageBlobUrl,
      fileName: `design_${designId}.png`,
      masterProductId: s.masterPrintifyProductId,
      title: copy.title,
      description: copy.description,
      tags: copy.tags,
      basePriceCents,
      preCreatedProductId,
    });

    if (result.status === 'live') {
      await db.update(listings).set({
        printifyProductId: result.printifyProductId,
        etsyListingId: result.etsyListingId,
        status: 'live',
        publishedAt: new Date(),
      }).where(eq(listings.id, listingId));
      await db.update(designs).set({ status: 'live' }).where(eq(designs.id, designId));
      await logEvent({ type: 'published', designId, batchId: design.batchId,
        payload: { etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl } });
      return { ok: true, status: 'live', listingId, etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl };
    }

    await db.update(listings).set({
      printifyProductId: result.printifyProductId, status: 'publishing_slow',
    }).where(eq(listings.id, listingId));
    return { ok: true, status: 'publishing_slow', listingId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.update(listings).set({ status: 'failed', failureReason: reason.slice(0, 500) }).where(eq(listings.id, listingId));
    await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, designId));
    await logEvent({ type: 'publish_failed', designId, batchId: design.batchId, payload: { reason: reason.slice(0, 500) } });
    return { ok: false, error: reason, listingId };
  }
}
