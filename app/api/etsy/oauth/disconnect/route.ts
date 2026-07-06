import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { getRequestUser } from '@/lib/auth/current-user';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  await db
    .update(settings)
    .set({
      etsyUserId: null,
      etsyShopIdOauth: null,
      etsyAccessToken: null,
      etsyRefreshToken: null,
      etsyTokenExpiresAt: null,
    })
    .where(eq(settings.userId, user.id));
  return NextResponse.json({ ok: true });
}
