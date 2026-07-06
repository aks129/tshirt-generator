import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/current-user';
import { getSettingsForUser } from '@/lib/settings/accessor';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ floorCents: 1499 });
  const s = await getSettingsForUser(user.id);
  return NextResponse.json({ floorCents: s?.minPriceFloorCents ?? 1499 });
}
