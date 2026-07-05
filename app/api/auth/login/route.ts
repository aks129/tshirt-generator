import { NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';
import { authenticateUser, ensureFounderUser, type AuthUser } from '@/lib/auth/users';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let user: AuthUser | null = null;
  if (typeof email === 'string' && email.trim().length > 0) {
    // Per-user credentials (B-1).
    user = await authenticateUser(email, password);
  } else if (process.env.APP_PASSWORD && password === process.env.APP_PASSWORD) {
    // Legacy shared-password path — maps to the founder so every existing
    // caller (login page, curl flows, scripts/publish-batch.mjs) keeps working.
    user = await ensureFounderUser();
  }

  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const token = await signSession({ userId: user.id, email: user.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
