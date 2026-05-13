import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { draftListingCopy } from '@/lib/ai/listing-copy';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const design = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!design) return NextResponse.json({ ok: false, error: 'Design not found' }, { status: 404 });

  const slogan = (design.concept as Concept).headline;
  const draft = await draftListingCopy({ slogan });

  await logEvent({
    type: 'generated',
    designId: id,
    batchId: design.batchId,
    payload: { kind: 'listing_drafted', source: draft.source, title: draft.title },
  });

  return NextResponse.json({ ok: true, draft });
}
