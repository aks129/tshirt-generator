import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';
import { PrintifyError } from '@/lib/printify/client';
import { logEvent } from '@/lib/events';
import { getRequestUser } from '@/lib/auth/current-user';

export const runtime = 'nodejs';
export const maxDuration = 90;

// On-demand mirror of the cron's external-deletion pass, scoped to the
// requesting user's live listings. Any whose Printify product 404s flips to
// 'failed'. Other errors (5xx, network) leave the row live.
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const liveListings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.userId, user.id), eq(listings.status, 'live'), isNotNull(listings.printifyProductId)));

  let checked = 0;
  let externallyDeleted = 0;
  let errors = 0;

  for (const l of liveListings) {
    if (!l.printifyProductId) continue;
    checked++;
    try {
      await getProduct(l.printifyProductId);
    } catch (err) {
      if (err instanceof PrintifyError && err.status === 404) {
        await db
          .update(listings)
          .set({ status: 'failed', failureReason: 'Removed from Printify externally' })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'publish_failed',
          designId: l.designId,
          payload: { kind: 'external_delete', source: 'printify_404', trigger: 'manual_sync' },
        });
        externallyDeleted++;
      } else {
        errors++;
      }
    }
  }

  return NextResponse.json({ ok: true, checked, externallyDeleted, errors });
}
