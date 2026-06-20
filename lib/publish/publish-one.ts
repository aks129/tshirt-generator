import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs, listings } from '@/lib/db/schema';
import { checkSafety } from '@/lib/ai/content-safety';
import { runPublish } from '@/lib/publish/publish-design';
import { recommendPrice } from '@/lib/etsy/price-recommendation';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;
const SAFETY_TIMEOUT_MS = 12_000;

/** Run the live content-safety check, but bounded by a timeout and never
 *  throwing. On timeout/error, fall back to the flags the design already
 *  earned during generation (`designs.safetyFlags`). This keeps a hung or
 *  rate-limited Gemini call from timing out the whole publish request. */
async function safetyFlagsBounded(
  design: { concept: unknown; safetyFlags: unknown },
  copy: PublishOneCopy,
): Promise<string[]> {
  const stored = Array.isArray(design.safetyFlags) ? (design.safetyFlags as string[]) : [];
  try {
    const live = await Promise.race([
      checkSafety({
        headline: (design.concept as Concept).headline,
        illustrationPrompt: 'n/a',
        title: copy.title,
        description: copy.description,
        tags: copy.tags,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('safety check timed out')), SAFETY_TIMEOUT_MS)),
    ]);
    return live.flags;
  } catch {
    return stored;
  }
}

export type PublishOneCopy = { title: string; description: string; tags: string[] };

export type PublishOneErrorKind =
  | 'settings' | 'kill_switch' | 'no_master' | 'no_design' | 'no_image'
  | 'dedup' | 'safety' | 'publish_error';

export type PublishOneResult = {
  ok: boolean;
  status?: 'live' | 'publishing_slow';
  listingId?: string;
  etsyListingId?: string;
  etsyUrl?: string;
  capReached?: boolean;
  error?: string;
  errorKind?: PublishOneErrorKind;
  flags?: string[];
};

export async function publishOneDesign(
  designId: string,
  copy: PublishOneCopy,
  opts: { overrideSafety?: boolean; priceCents?: number; resume?: boolean } = {},
): Promise<PublishOneResult> {
  const s = await db.query.settings.findFirst();
  if (!s) return { ok: false, error: 'Settings missing', errorKind: 'settings' };
  if (s.killSwitchActive) return { ok: false, error: 'Kill switch active', errorKind: 'kill_switch' };
  if (!s.masterPrintifyProductId) return { ok: false, error: 'No master Printify product selected.', errorKind: 'no_master' };

  const since = new Date(Date.now() - DAY_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(gte(listings.createdAt, since));
  if (count >= s.dailyPublishCap) {
    return { ok: false, capReached: true, error: `Daily publish cap reached (${count}/${s.dailyPublishCap})` };
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return { ok: false, error: 'Design not found', errorKind: 'no_design' };
  if (!design.imageBlobUrl) return { ok: false, error: 'Design has no image', errorKind: 'no_image' };

  const existing = await db.query.listings.findFirst({
    where: and(eq(listings.designId, designId), sql`status in ('publishing','publishing_slow','live')`),
  });
  let listingId: string;
  let preCreatedProductId: string | undefined;
  if (existing) {
    if (!opts.resume) return { ok: false, error: 'Design already published or publishing', errorKind: 'dedup' };
    listingId = existing.id;
    preCreatedProductId = existing.printifyProductId ?? undefined;
  } else {
    if (!opts.overrideSafety) {
      // Bounded + non-fatal: a hanging/rate-limited Gemini safety call must not
      // burn the whole function budget (free-tier 429 backoff was causing 504s).
      // On timeout/error, fall back to the flags the design already earned at
      // generation time rather than blocking all publishing.
      const flags = await safetyFlagsBounded(design, copy);
      if (flags.length > 0) {
        return { ok: false, error: 'Content blocked', errorKind: 'safety', flags };
      }
    }
    // Upsert on the unique designId: a design may have a prior 'failed' (or
    // rejected) listing row that the active-status dedup above doesn't match;
    // re-publishing must reuse that row, not violate the unique constraint.
    const [row] = await db
      .insert(listings)
      .values({ designId, title: copy.title, description: copy.description, tags: copy.tags, status: 'publishing', editedByUser: true })
      .onConflictDoUpdate({
        target: listings.designId,
        set: {
          title: copy.title, description: copy.description, tags: copy.tags,
          status: 'publishing', failureReason: null, etsyListingId: null,
          printifyProductId: null, publishedAt: null, editedByUser: true,
        },
      })
      .returning();
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
      // Record the product id the moment it's cloned so a retry after a
      // mid-publish crash reuses it instead of minting an orphan.
      onProductCreated: async (productId) => {
        await db.update(listings).set({ printifyProductId: productId }).where(eq(listings.id, listingId));
      },
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
    return { ok: false, error: reason, listingId, errorKind: 'publish_error' };
  }
}
