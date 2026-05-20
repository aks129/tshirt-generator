import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

const bodySchema = z.object({
  masterPrintifyProductId: z.string().min(1).nullable(),
  dailyGenerationCap: z.number().int().min(1),
  dailyPublishCap: z.number().int().min(1),
  dailyBudgetCents: z.number().int().min(0),
  killSwitchActive: z.boolean(),
  priceOffsetCents: z.number().int().min(0),
  minPriceFloorCents: z.number().int().min(500),
  mockupSelection: z
    .object({ labels: z.array(z.string().min(1).max(64)).max(9) })
    .nullable()
    .optional(),
});

export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  await db
    .update(settings)
    .set({
      ...parsed.data,
      printifySetupAt: parsed.data.masterPrintifyProductId ? new Date() : null,
    })
    .where(eq(settings.id, 1));

  return NextResponse.json({ ok: true });
}
