import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

const bodySchema = z.object({
  defaultPrintifyBlueprintId: z.number().int().positive(),
  defaultPrintProviderId: z.number().int().positive(),
  defaultVariants: z.object({ variantIds: z.array(z.number().int().positive()).min(1) }),
  dailyGenerationCap: z.number().int().min(1),
  dailyPublishCap: z.number().int().min(1),
  dailyBudgetCents: z.number().int().min(0),
  killSwitchActive: z.boolean(),
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
      printifySetupAt: new Date(),
    })
    .where(eq(settings.id, 1));

  return NextResponse.json({ ok: true });
}
