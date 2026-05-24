import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs, listings, settings } from '@/lib/db/schema';
import { logEvent } from '@/lib/events';
import {
  uploadImageByUrl,
  createProduct,
  getProduct,
  listVariants,
} from '@/lib/printify/client';
import { generateListing } from '@/lib/ai/listing-generator';
import type { Concept } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const design = await db.query.designs.findFirst({ where: eq(designs.id, id) });
    if (!design) return NextResponse.json({ ok: false, error: 'design not found' }, { status: 404 });
    if (design.status !== 'approved' && design.status !== 'pending_review') {
      return NextResponse.json(
        { ok: false, error: `design status ${design.status} is not publishable` },
        { status: 400 },
      );
    }
    if (!design.imageBlobUrl) {
      return NextResponse.json({ ok: false, error: 'design has no image' }, { status: 400 });
    }

    const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
    if (!cfg?.printifyShopId || !cfg.defaultPrintifyBlueprintId || !cfg.defaultPrintProviderId) {
      return NextResponse.json(
        { ok: false, error: 'Printify defaults not configured. Visit /settings.' },
        { status: 400 },
      );
    }
    const variantIds = Array.isArray(cfg.defaultVariants) ? (cfg.defaultVariants as number[]) : [];
    if (variantIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No default variants configured. Visit /settings.' },
        { status: 400 },
      );
    }

    const shopId = Number(cfg.printifyShopId);
    const blueprintId = cfg.defaultPrintifyBlueprintId;
    const providerId = cfg.defaultPrintProviderId;

    // 1) Look up base cost from the cheapest selected variant so the AI prices above it.
    const variantsResp = await listVariants(blueprintId, providerId);
    const selected = variantsResp.variants.filter((v) => variantIds.includes(v.id));
    if (selected.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Configured variants no longer exist on this blueprint/provider' },
        { status: 400 },
      );
    }
    const baseCost = Math.min(...selected.map((v) => v.cost));

    // 2) Ask Gemini for title/description/tags/price.
    const concept = design.concept as Concept;
    const listing = await generateListing({
      headline: concept.headline,
      niche: concept.niche_keywords?.[0] ?? null,
      mood: concept.mood,
      style: design.style,
      baseCostCents: baseCost,
    });

    // 3) Upload design PNG to Printify.
    const upload = await uploadImageByUrl({
      fileName: `${id}.png`,
      url: design.imageBlobUrl,
    });

    // 4) Create the Printify product.
    const product = await createProduct({
      shopId,
      title: listing.title,
      description: listing.description,
      blueprintId,
      printProviderId: providerId,
      variantIds,
      priceCents: listing.suggested_price_cents,
      uploadId: upload.id,
      tags: listing.tags,
    });

    // 5) Fetch mockups (Printify generates them async, but they are usually
    // available on the immediate response).
    const detail = await getProduct(shopId, product.id);
    const mockupUrls = detail.images.slice(0, 8).map((m) => m.src);

    // 6) Upsert listing row.
    const [row] = await db
      .insert(listings)
      .values({
        designId: id,
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        printifyProductId: product.id,
        status: 'publishing',
        priceCents: listing.suggested_price_cents,
        currency: 'USD',
        printifyMockupUrls: mockupUrls,
        priceRationale: listing.price_rationale,
      })
      .onConflictDoUpdate({
        target: listings.designId,
        set: {
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          printifyProductId: product.id,
          status: 'publishing',
          priceCents: listing.suggested_price_cents,
          printifyMockupUrls: mockupUrls,
          priceRationale: listing.price_rationale,
        },
      })
      .returning();

    await db
      .update(designs)
      .set({
        status: 'publishing',
        mockupBlobUrl: mockupUrls[0] ?? design.mockupBlobUrl,
      })
      .where(eq(designs.id, id));

    await logEvent({
      type: 'published_to_printify',
      designId: id,
      batchId: design.batchId,
      payload: { productId: product.id, priceCents: listing.suggested_price_cents },
    });

    return NextResponse.json({ ok: true, listing: row, product: { id: product.id, mockupUrls } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent({ type: 'publish_failed', designId: id, payload: { error: msg } });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
