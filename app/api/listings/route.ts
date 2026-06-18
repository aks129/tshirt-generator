import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listingCopySchema } from '@/lib/etsy/validators';
import { publishOneDesign } from '@/lib/publish/publish-one';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = listingCopySchema.extend({
  design_id: z.string().uuid(),
  override_safety: z.boolean().optional(),
  // Optional manual price override from the publish modal. When present it
  // wins over the dynamic competitive recommendation (clamped to the floor).
  price_cents: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid body', issues: parsed.error.format() },
      { status: 400 },
    );
  }
  const { design_id, title, tags, description, override_safety, price_cents } = parsed.data;

  const r = await publishOneDesign(design_id, { title, description, tags }, {
    overrideSafety: override_safety,
    priceCents: typeof price_cents === 'number' ? price_cents : undefined,
  });

  if (r.capReached) return NextResponse.json({ ok: false, error: r.error }, { status: 429 });
  if (!r.ok) {
    const status = r.error?.startsWith('Content blocked') ? 422 : 502;
    return NextResponse.json({ ok: false, error: r.error, listingId: r.listingId }, { status });
  }
  return NextResponse.json(
    { ok: true, listingId: r.listingId, status: r.status, etsyListingId: r.etsyListingId, etsyUrl: r.etsyUrl },
    { status: r.status === 'live' ? 200 : 202 },
  );
}
