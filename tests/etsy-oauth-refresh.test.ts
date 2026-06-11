import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { settings: { findFirst: vi.fn() } },
    update: vi.fn(),
  },
}));

beforeEach(() => {
  vi.stubEnv('ETSY_API_KEY', 'test-keystring');
});

import { db } from '@/lib/db/client';
import { getEtsyAccessToken } from '@/lib/etsy/oauth-client';
import { EtsyAuthNotConnected, EtsyAuthExpired } from '@/lib/etsy/errors';

function chainUpdateMock() {
  vi.mocked(db.update).mockReturnValue({
    set: () => ({ where: () => Promise.resolve() }),
  } as never);
}

describe('getEtsyAccessToken', () => {
  it('throws EtsyAuthNotConnected when no access token', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, etsyAccessToken: null, etsyRefreshToken: null, etsyTokenExpiresAt: null,
    } as never);
    await expect(getEtsyAccessToken()).rejects.toBeInstanceOf(EtsyAuthNotConnected);
  });

  it('returns current token if fresh (>60s from expiry)', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, etsyAccessToken: 'abc.fresh', etsyRefreshToken: 'r', etsyTokenExpiresAt: future,
    } as never);
    const fetchSpy = vi.spyOn(global, 'fetch');
    const t = await getEtsyAccessToken();
    expect(t).toBe('abc.fresh');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when within 60s of expiry, persists new tokens', async () => {
    const soon = new Date(Date.now() + 30 * 1000);
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, etsyAccessToken: 'abc.stale', etsyRefreshToken: 'oldRefresh', etsyTokenExpiresAt: soon,
    } as never);
    chainUpdateMock();
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: '12345.new', refresh_token: 'newRefresh', expires_in: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const t = await getEtsyAccessToken();
    expect(t).toBe('12345.new');
  });

  it('clears tokens + throws EtsyAuthExpired on 401 from token endpoint', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, etsyAccessToken: 'abc.stale', etsyRefreshToken: 'oldRefresh',
      etsyTokenExpiresAt: new Date(Date.now() - 1000),
    } as never);
    chainUpdateMock();
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    );
    await expect(getEtsyAccessToken()).rejects.toBeInstanceOf(EtsyAuthExpired);
  });
});
