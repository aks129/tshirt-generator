import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, listingStats } from '@/lib/db/schema';
import { fetchEtsyListingStats } from '@/lib/etsy/listing-stats';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Etsy is generous at this volume (~1 call per live listing per day), but
// pace anyway so a big catalog never bursts.
const PACE_MS = 250;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const live = await db
    .select({ id: listings.id, etsyListingId: listings.etsyListingId })
    .from(listings)
    .where(and(eq(listings.status, 'live'), isNotNull(listings.etsyListingId)));

  let captured = 0;
  let failed = 0;

  for (const l of live) {
    if (!l.etsyListingId) continue;
    try {
      const stats = await fetchEtsyListingStats(l.etsyListingId);
      await db.insert(listingStats).values({
        listingId: l.id,
        etsyListingId: l.etsyListingId,
        views: stats.views,
        favorers: stats.favorers,
        state: stats.state,
      });
      captured++;
    } catch {
      // Per-listing failures never abort the run; totals are reported below.
      failed++;
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  await logEvent({
    type: 'generated',
    payload: { kind: 'stats_run', scanned: live.length, captured, failed },
  });

  return NextResponse.json({ ok: true, scanned: live.length, captured, failed });
}
