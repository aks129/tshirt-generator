import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, listingStats } from '@/lib/db/schema';
import { fetchEtsyListingStats } from '@/lib/etsy/listing-stats';
import { fetchSalesByListing } from '@/lib/etsy/receipts';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { getFounderSettings } from '@/lib/settings/accessor';
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

  // Sales need seller OAuth with the transactions_r scope. Tokens granted
  // before that scope was added will 403 — record sales as unknown (null)
  // rather than failing the run; the operator reconnects Etsy to enable it.
  // B-3.1: founder-scoped for now (single Etsy shop). Per-user sales
  // attribution across tenants is deferred to B-3.1b's per-user cron pass.
  let salesByListing: Map<string, number> | null = null;
  try {
    const s = await getFounderSettings();
    if (s?.etsyShopIdOauth && s.userId) {
      const accessToken = await getEtsyAccessToken(s.userId);
      salesByListing = await fetchSalesByListing({ accessToken, shopId: Number(s.etsyShopIdOauth) });
    }
  } catch {
    salesByListing = null;
  }

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
        sales: salesByListing ? (salesByListing.get(l.etsyListingId) ?? 0) : null,
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
    payload: { kind: 'stats_run', scanned: live.length, captured, failed, salesTracked: salesByListing !== null },
  });

  return NextResponse.json({ ok: true, scanned: live.length, captured, failed, salesTracked: salesByListing !== null });
}
