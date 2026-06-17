import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '12345678'),
  shopPath: vi.fn((s: string) => `/shops/12345678${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { getProduct } from '@/lib/printify/get-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '12345678');
});

describe('getProduct', () => {
  it('returns isLocked: true when product is_locked is true', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod1',
      title: 'test',
      visible: true,
      is_locked: true,
      external: null,
    });
    const r = await getProduct('prod1');
    expect(r.isLocked).toBe(true);
    expect(r.etsyListingId).toBeNull();
  });

  it('returns isLocked: false when is_locked is absent', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod2',
      title: 'test',
      visible: true,
      external: { id: 'etsy123', handle: 'https://etsy.com/listing/123' },
    });
    const r = await getProduct('prod2');
    expect(r.isLocked).toBe(false);
    expect(r.etsyListingId).toBe('etsy123');
    expect(r.etsyUrl).toBe('https://etsy.com/listing/123');
  });
});
