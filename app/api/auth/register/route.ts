import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';
import { registerUser } from '@/lib/auth/users';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80).optional(),
  // Private beta: registration is gated by a shared invite code (SIGNUP_CODE
  // env). Open signup is a launch decision, not an infra one.
  signupCode: z.string(),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const expected = process.env.SIGNUP_CODE;
  if (!expected || parsed.data.signupCode !== expected) {
    // Generic 401 — don't leak whether registration is even open.
    return NextResponse.json({ ok: false, error: 'Registration not available' }, { status: 401 });
  }

  const r = await registerUser(parsed.data);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: 'Email already registered' }, { status: 409 });
  }

  const token = await signSession({ userId: r.user.id, email: r.user.email });
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
