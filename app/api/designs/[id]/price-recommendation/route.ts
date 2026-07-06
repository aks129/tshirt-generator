import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { recommendPrice } from '@/lib/etsy/price-recommendation';
import type { Concept } from '@/lib/schemas';
import { requireOwnedDesign } from '@/lib/auth/ownership';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  const design = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!design) return NextResponse.json({ ok: false, error: 'Design not found' }, { status: 404 });

  const settings = await db.query.settings.findFirst();
  if (!settings) return NextResponse.json({ ok: false, error: 'Settings missing' }, { status: 500 });

  const concept = design.concept as Concept;
  const result = await recommendPrice({
    concept: { headline: concept.headline, niche_keywords: concept.niche_keywords ?? [] },
    settings: {
      priceOffsetCents: settings.priceOffsetCents,
      minPriceFloorCents: settings.minPriceFloorCents,
    },
    force,
  });

  return NextResponse.json({ ok: true, ...result });
}
