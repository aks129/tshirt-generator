import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('AUTH_COOKIE_SECRET', 'a'.repeat(64));

import { signSession, verifySession } from '@/lib/auth/session';

describe('session', () => {
  it('signs and verifies a session token', async () => {
    const token = await signSession();
    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(20);
    const ok = await verifySession(token);
    expect(ok).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const token = await signSession();
    const tampered = token.slice(0, -2) + 'xx';
    const ok = await verifySession(tampered);
    expect(ok).toBe(false);
  });

  it('rejects an empty token', async () => {
    const ok = await verifySession('');
    expect(ok).toBe(false);
  });
});
