import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function POST() {
  await db
    .update(settings)
    .set({
      etsyUserId: null,
      etsyShopIdOauth: null,
      etsyAccessToken: null,
      etsyRefreshToken: null,
      etsyTokenExpiresAt: null,
    })
    .where(eq(settings.id, 1));
  return NextResponse.json({ ok: true });
}
