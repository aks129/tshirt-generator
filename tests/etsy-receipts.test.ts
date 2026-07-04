import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSalesByListing } from '@/lib/etsy/receipts';

beforeEach(() => {
  vi.stubEnv('ETSY_API_KEY', 'kkk');
  vi.stubEnv('ETSY_SHARED_SECRET', 'sss');
});

function receiptsPage(receipts: Array<{ transactions: Array<{ listing_id: number; quantity?: number }> }>, count: number) {
  return new Response(JSON.stringify({ count, results: receipts }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchSalesByListing', () => {
  it('sums transaction quantities per listing across paid receipts', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      receiptsPage(
        [
          { transactions: [{ listing_id: 111, quantity: 2 }, { listing_id: 222 }] },
          { transactions: [{ listing_id: 111, quantity: 1 }] },
        ],
        2,
      ),
    );

    const sales = await fetchSalesByListing({ accessToken: 'tok', shopId: 42 });

    expect(sales.get('111')).toBe(3);
    expect(sales.get('222')).toBe(1); // missing quantity counts as 1
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/v3/application/shops/42/receipts?was_paid=true');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['x-api-key']).toBe('kkk:sss');
  });

  it('pages until all receipts are consumed', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(receiptsPage(Array.from({ length: 100 }, () => ({ transactions: [{ listing_id: 1 }] })), 150))
      .mockResolvedValueOnce(receiptsPage(Array.from({ length: 50 }, () => ({ transactions: [{ listing_id: 1 }] })), 150));

    const sales = await fetchSalesByListing({ accessToken: 'tok', shopId: 42 });

    expect(sales.get('1')).toBe(150);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain('offset=100');
  });

  it('throws on non-OK (e.g. 403 missing transactions_r scope)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('insufficient scope', { status: 403 }));
    await expect(fetchSalesByListing({ accessToken: 'tok', shopId: 42 })).rejects.toThrow(/403/);
  });
});
