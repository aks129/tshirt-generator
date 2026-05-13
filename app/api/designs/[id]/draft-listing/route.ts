import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { draftListingCopy, type DraftResult } from '@/lib/ai/listing-copy';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const draft = await draftListingCopy({ slogan });

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
