import { NextResponse } from 'next/server';
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';
import { PrintifyError } from '@/lib/printify/client';
import { logEvent } from '@/lib/events';
import { processListingPhotos } from '@/lib/mockups/process-listing';
import { classifyStuckPublish } from '@/lib/publish/classify-stuck-publish';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cutoff1h = new Date(Date.now() - 60 * 60 * 1000);

  const stuck = await db
    .select()
    .from(listings)
    .where(
      and(
        or(eq(listings.status, 'publishing'), eq(listings.status, 'publishing_slow')),
        lt(listings.createdAt, cutoff1h),
      ),
    );

  let reconciled = 0;
  let failed = 0;

  for (const l of stuck) {
    if (!l.printifyProductId) continue;
    try {
      const status = await getProduct(l.printifyProductId);
      const decision = classifyStuckPublish({
        isLocked: status.isLocked,
        hasExternal: !!(status.etsyListingId && status.etsyUrl),
        ageMs: Date.now() - new Date(l.createdAt).getTime(),
        cutoffMs: 60 * 60 * 1000,
      });

      if (decision === 'live') {
        await db
          .update(listings)
          .set({ etsyListingId: status.etsyListingId, status: 'live', publishedAt: new Date() })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'live' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'published',
          designId: l.designId,
          payload: { reconciled: true, etsyListingId: status.etsyListingId },
        });
        reconciled++;
      } else if (decision === 'failed') {
        await db
          .update(listings)
          .set({
            status: 'failed',
            failureReason:
              'Printify accepted the publish but no Etsy listing was created — check the Printify dashboard.',
          })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'publish_failed',
          designId: l.designId,
          payload: { reconcile: true, reason: 'unlocked_no_external' },
        });
        failed++;
      }
      // decision === 'wait' → Printify still processing; check again next cron run
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await logEvent({
        type: 'publish_failed',
        designId: l.designId,
        payload: { reconcile: true, reason: reason.slice(0, 500) },
      });
    }
  }

  // External-deletion check: any live listing whose Printify product no
  // longer exists (404) gets flipped to 'failed'. Common cause: operator
  // deleted the product in Printify or unpublished it from Etsy directly.
  const liveListings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.status, 'live'), isNotNull(listings.printifyProductId)));

  let externallyDeleted = 0;
  for (const l of liveListings) {
    if (!l.printifyProductId) continue;
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
          payload: { kind: 'external_delete', source: 'printify_404' },
        });
        externallyDeleted++;
      }
      // Other errors (5xx, network) — leave as live, will retry next cron.
    }
  }

  // Photos backfill pass — any live listing without photos, < 7 days old.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendingPhotos = await db
    .select()
    .from(listings)
    .where(and(
      eq(listings.status, 'live'),
      isNotNull(listings.etsyListingId),
      isNull(listings.photosUploadedAt),
      gt(listings.createdAt, sevenDaysAgo),
    ));

  let photosUploaded = 0;
  let photosSkipped = 0;
  for (const l of pendingPhotos) {
    try {
      const r = await processListingPhotos(l.id);
      if (r.ok) {
        photosUploaded++;
      } else if (r.errorCode === 'NOT_CONNECTED' || r.errorCode === 'AUTH_EXPIRED') {
        photosSkipped++;
        break;
      } else {
        photosSkipped++;
      }
    } catch {
      photosSkipped++;
    }
  }

  await logEvent({
    type: 'generated',
    payload: {
      kind: 'reconcile_run',
      scanned: stuck.length,
      reconciled,
      failed,
      externallyDeleted,
      photosUploaded,
      photosSkipped,
    },
  });

  return NextResponse.json({
    ok: true,
    scanned: stuck.length,
    reconciled,
    failed,
    externallyDeleted,
    photosUploaded,
    photosSkipped,
  });
}
