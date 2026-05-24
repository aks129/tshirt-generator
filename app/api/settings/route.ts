import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const updateSchema = z.object({
  printifyShopId: z.string().min(1).optional(),
  defaultPrintifyBlueprintId: z.number().int().positive().optional(),
  defaultPrintProviderId: z.number().int().positive().optional(),
  defaultVariants: z.array(z.number().int().positive()).optional(),
});

export const runtime = 'nodejs';

export async function GET() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return NextResponse.json({ ok: true, settings: row ?? null });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const patch = parsed.data;

  // Upsert (id is always 1 for the singleton row).
  await db
    .insert(settings)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        ...(patch.printifyShopId !== undefined && { printifyShopId: patch.printifyShopId }),
        ...(patch.defaultPrintifyBlueprintId !== undefined && {
          defaultPrintifyBlueprintId: patch.defaultPrintifyBlueprintId,
        }),
        ...(patch.defaultPrintProviderId !== undefined && {
          defaultPrintProviderId: patch.defaultPrintProviderId,
        }),
        ...(patch.defaultVariants !== undefined && { defaultVariants: patch.defaultVariants }),
      },
    });

  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return NextResponse.json({ ok: true, settings: row });
}
