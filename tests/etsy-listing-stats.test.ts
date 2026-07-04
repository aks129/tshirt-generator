import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEtsyListingStats } from '@/lib/etsy/listing-stats';

beforeEach(() => {
  vi.stubEnv('ETSY_API_KEY', 'kkk');
  vi.stubEnv('ETSY_SHARED_SECRET', 'sss');
});

describe('fetchEtsyListingStats', () => {
  it('GETs the public listing with keystring:secret auth and maps views/favorers/state', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ listing_id: 123, state: 'active', views: 57, num_favorers: 4 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const r = await fetchEtsyListingStats('123');

    expect(r).toEqual({ views: 57, favorers: 4, state: 'active' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://openapi.etsy.com/v3/application/listings/123');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'kkk:sss' });
  });

  it('treats missing numeric fields as 0', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ listing_id: 9, state: 'active' }), { status: 200 }),
    );
    const r = await fetchEtsyListingStats('9');
    expect(r).toEqual({ views: 0, favorers: 0, state: 'active' });
  });

  it('maps a 404 to state removed (delisted) instead of throwing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const r = await fetchEtsyListingStats('gone');
    expect(r).toEqual({ views: 0, favorers: 0, state: 'removed' });
  });

  it('throws on other non-OK statuses', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(fetchEtsyListingStats('1')).rejects.toThrow(/429/);
  });
});
