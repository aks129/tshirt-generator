import { NextResponse } from 'next/server';
import { desc, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings } from '@/lib/db/schema';
import { fetchAllPrintifyImageLabels } from '@/lib/mockups/printify-mockups';

export const runtime = 'nodejs';

// Fallback when no Printify products exist yet. These are the standard Gildan
// 5000 camera_labels Printify renders.
const GILDAN_5000_DEFAULT_LABELS = [
  'front', 'front-2', 'back-2', 'folded',
  'hanging-1', 'hanging-2', 'hanging-3',
  'person-1', 'person-2', 'person-3', 'person-4', 'person-5', 'person-6',
  'person-7-front', 'person-8-front',
  'lifestyle', 'duo-2', 'duo-3', 'size-chart',
];

export async function GET() {
  const latest = await db
    .select({ printifyProductId: listings.printifyProductId })
    .from(listings)
    .where(isNotNull(listings.printifyProductId))
    .orderBy(desc(listings.createdAt))
    .limit(1);

  if (latest[0]?.printifyProductId) {
    try {
      const labels = await fetchAllPrintifyImageLabels(latest[0].printifyProductId);
      if (labels.length > 0) {
        return NextResponse.json({ ok: true, labels, source: 'live_product' });
      }
    } catch {
      /* fall through to defaults */
    }
  }

  return NextResponse.json({ ok: true, labels: GILDAN_5000_DEFAULT_LABELS, source: 'default' });
}
