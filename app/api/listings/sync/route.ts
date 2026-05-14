import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';
import { PrintifyError } from '@/lib/printify/client';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 90;

// On-demand mirror of the cron's external-deletion pass. Live listings are
// checked against Printify; any whose product 404s flips to 'failed' with a
// reason note. Other errors (5xx, network) leave the row live.
export async function POST() {
  const liveListings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.status, 'live'), isNotNull(listings.printifyProductId)));

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
