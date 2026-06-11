import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { shirtTemplates } from '@/lib/db/schema';

export const runtime = 'nodejs';

// Sensible center-chest defaults for a Gildan-5000-shaped tee laid flat or worn.
// Operator can tweak per-template; this just keeps the form usable out of the box.
const DEFAULT_PRINT_AREA = { x: 0.3, y: 0.28, w: 0.4, h: 0.36 };

const printAreaSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  h: z.number().min(0.05).max(1),
});

const bodySchema = z.object({
  label: z.string().min(1).max(120),
  blueprintId: z.number().int().positive(),
  providerId: z.number().int().positive().optional(),
  variantIds: z.array(z.number().int()).optional(),
  colorName: z.string().max(60).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  blankImageUrl: z.string().url(),
  printArea: printAreaSchema.optional(),
  source: z.enum(['upload', 'printify']).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  const rows = await db.select().from(shirtTemplates).orderBy(desc(shirtTemplates.createdAt));
  return NextResponse.json({ ok: true, templates: rows });
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body', issues: parsed.error.format() }, { status: 400 });
  }
  const data = parsed.data;

  // Only one row can be the default at any time.
  if (data.isDefault) {
    await db.update(shirtTemplates).set({ isDefault: false }).where(eq(shirtTemplates.isDefault, true));
  }

  const [row] = await db.insert(shirtTemplates).values({
    label: data.label,
    blueprintId: data.blueprintId,
    providerId: data.providerId,
    variantIds: data.variantIds ?? [],
    colorName: data.colorName,
    colorHex: data.colorHex,
    blankImageUrl: data.blankImageUrl,
    printArea: data.printArea ?? DEFAULT_PRINT_AREA,
    source: data.source ?? 'upload',
    isDefault: data.isDefault ?? false,
  }).returning();

  return NextResponse.json({ ok: true, template: row });
}
