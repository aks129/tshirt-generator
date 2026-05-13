import { NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== 'string' || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = await signSession();
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
