import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '12345678'),
  shopPath: vi.fn((s: string) => `/shops/12345678${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { publishProduct } from '@/lib/printify/publish-product';
import { getProduct } from '@/lib/printify/get-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '12345678');
});

describe('publishProduct', () => {
  it('POSTs the publish endpoint with all-true fields', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({});
    await publishProduct('prod_xyz');
    const [path, opts] = vi.mocked(printifyFetch).mock.calls[0];
    expect(path).toBe('/shops/12345678/products/prod_xyz/publish.json');
    expect((opts as { body: Record<string, unknown> }).body).toEqual({
      title: true, description: true, images: true, variants: true, tags: true,
    });
  });
});

describe('getProduct', () => {
  it('returns parsed product with etsy listing id if external present', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod_xyz',
      title: 'Whatever',
      external: { id: '12345678901', handle: 'https://etsy.com/listing/12345678901' },
      visible: true,
    });
    const r = await getProduct('prod_xyz');
    expect(r.productId).toBe('prod_xyz');
    expect(r.etsyListingId).toBe('12345678901');
    expect(r.etsyUrl).toBe('https://etsy.com/listing/12345678901');
  });

  it('returns null etsy ids when not yet published', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_xyz', visible: false });
    const r = await getProduct('prod_xyz');
    expect(r.etsyListingId).toBeNull();
    expect(r.etsyUrl).toBeNull();
  });
});
