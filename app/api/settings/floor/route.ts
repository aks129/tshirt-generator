import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  const s = await db.query.settings.findFirst();
  return NextResponse.json({ floorCents: s?.minPriceFloorCents ?? 1499 });
}
