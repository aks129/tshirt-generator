import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { shirtTemplates } from '@/lib/db/schema';

export const runtime = 'nodejs';

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
  printArea: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0.05).max(1),
      h: z.number().min(0.05).max(1),
    })
    .optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body', issues: parsed.error.format() }, { status: 400 });
  }
  const row = await db.query.shirtTemplates.findFirst({ where: eq(shirtTemplates.id, id) });
  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  if (parsed.data.isDefault) {
    // Single-default invariant.
    await db.update(shirtTemplates).set({ isDefault: false }).where(eq(shirtTemplates.isDefault, true));
  }

  const [updated] = await db
    .update(shirtTemplates)
    .set({
      label: parsed.data.label ?? row.label,
      isDefault: parsed.data.isDefault ?? row.isDefault,
      printArea: parsed.data.printArea ?? row.printArea,
    })
    .where(eq(shirtTemplates.id, id))
    .returning();
  return NextResponse.json({ ok: true, template: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await db.query.shirtTemplates.findFirst({ where: eq(shirtTemplates.id, id) });
  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  await db.delete(shirtTemplates).where(eq(shirtTemplates.id, id));
  return NextResponse.json({ ok: true });
}
