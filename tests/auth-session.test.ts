import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('AUTH_COOKIE_SECRET', 'a'.repeat(64));

import { SignJWT } from 'jose';
import { signSession, verifySession } from '@/lib/auth/session';

describe('session', () => {
  it('signs and verifies a v2 session carrying the user identity', async () => {
    const token = await signSession({ userId: 'u_123', email: 'a@x.com' });
    expect(token).toBeTypeOf('string');
    const info = await verifySession(token);
    expect(info).toEqual({ userId: 'u_123', email: 'a@x.com', legacy: false });
  });

  it('treats a pre-B1 payload (no sub) as a legacy founder session', async () => {
    const legacyToken = await new SignJWT({ ok: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode('a'.repeat(64)));
    const info = await verifySession(legacyToken);
    expect(info).toEqual({ legacy: true });
  });

  it('rejects a tampered token', async () => {
    const token = await signSession({ userId: 'u_123', email: 'a@x.com' });
    expect(await verifySession(token.slice(0, -2) + 'xx')).toBeNull();
  });

  it('rejects an empty token', async () => {
    expect(await verifySession('')).toBeNull();
  });
});
