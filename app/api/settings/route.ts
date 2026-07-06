import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getRequestUser } from '@/lib/auth/current-user';
import { getSettingsForUser } from '@/lib/settings/accessor';

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
  // Optional default template — not used by the master-product publish path;
  // stored as a reference default for the generator/AI workflow.
  defaultPrintifyBlueprintId: z.number().int().nullable().optional(),
  defaultPrintProviderId: z.number().int().nullable().optional(),
  defaultVariants: z
    .object({ variantIds: z.array(z.number().int()) })
    .nullable()
    .optional(),
});

export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  // Ensure the caller has a settings row, then update by owner (B-3.1 per-user).
  await getSettingsForUser(user.id);

  await db
    .update(settings)
    .set({
      ...parsed.data,
      printifySetupAt: parsed.data.masterPrintifyProductId ? new Date() : null,
    })
    .where(eq(settings.userId, user.id));

  return NextResponse.json({ ok: true });
}
