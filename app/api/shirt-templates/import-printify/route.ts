import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { shirtTemplates } from '@/lib/db/schema';
import { fetchBlueprintDetail } from '@/lib/printify/catalog';

export const runtime = 'nodejs';

const bodySchema = z.object({
  blueprintId: z.number().int().positive(),
  providerId: z.number().int().positive().optional(),
});

const DEFAULT_PRINT_AREA = { x: 0.3, y: 0.28, w: 0.4, h: 0.36 };

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }
  const { blueprintId, providerId } = parsed.data;

  let detail;
  try {
    detail = await fetchBlueprintDetail(blueprintId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Take up to 4 stock images from the blueprint detail. Printify exposes
  // these CDN URLs publicly; we reference them directly rather than re-host.
  const images = detail.images.slice(0, 4);
  if (images.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Blueprint has no catalog images' },
      { status: 400 },
    );
  }

  const inserted = [];
  for (const [i, src] of images.entries()) {
    const label = `${detail.brand ?? ''} ${detail.model ?? detail.title} (catalog #${i + 1})`.trim();
    const [row] = await db.insert(shirtTemplates).values({
      label,
      blueprintId,
      providerId,
      variantIds: [],
      blankImageUrl: src,
      printArea: DEFAULT_PRINT_AREA,
      source: 'printify',
      isDefault: false,
    }).returning();
    inserted.push(row);
  }

  return NextResponse.json({ ok: true, imported: inserted.length, templates: inserted });
}
