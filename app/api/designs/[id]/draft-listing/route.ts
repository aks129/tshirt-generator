import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { draftListingCopy, type DraftResult } from '@/lib/ai/listing-copy';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';
import { requireOwnedDesign } from '@/lib/auth/ownership';
import { getSettingsForDesign } from '@/lib/settings/accessor';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  const design = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!design) return NextResponse.json({ ok: false, error: 'Design not found' }, { status: 404 });

  // Serve a cached draft if we already drafted this design and the caller
  // isn't explicitly asking for a fresh draft. Free-tier Gemini is rate-limited;
  // re-opening a modal shouldn't re-burn the budget.
  if (!force && design.listingDraft) {
    return NextResponse.json({ ok: true, draft: design.listingDraft });
  }

  const slogan = (design.concept as Concept).headline;

  // Derive the garment/material line from the master product's blueprint so the
  // description is accurate. Non-blocking: any failure leaves garment undefined
  // and the generator applies its safe default.
  let garment: string | undefined;
  try {
    const s = await getSettingsForDesign(id);
    if (s?.masterPrintifyProductId) {
      const master = await fetchMasterProduct(s.masterPrintifyProductId);
      garment = (await getGarmentDescriptor(master.blueprintId)) ?? undefined;
    }
  } catch {
    /* non-blocking — default garment used */
  }

  const draft = await draftListingCopy({ slogan, garment });

  // Persist successful drafts. Fallback drafts also get cached so the user
  // sees consistent text on re-open; a `force=true` refresh re-runs Gemini.
  const draftToCache: DraftResult = draft;
  await db
    .update(designs)
    .set({ listingDraft: draftToCache })
    .where(eq(designs.id, id));

  await logEvent({
    type: 'generated',
    designId: id,
    batchId: design.batchId,
    payload: { kind: 'listing_drafted', source: draft.source, title: draft.title, force },
  });

  return NextResponse.json({ ok: true, draft });
}
