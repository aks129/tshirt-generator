import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '27519707'),
  shopPath: vi.fn((s: string) => `/shops/27519707${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { createProduct } from '@/lib/printify/create-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

describe('createProduct', () => {
  it('builds variants payload and returns product id', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod_xyz',
      title: 'Coffee You Later',
      blueprint_id: 6,
      print_provider_id: 99,
      variants: [{ id: 4011, is_enabled: true }],
    });
    const r = await createProduct({
      blueprintId: 6,
      printProviderId: 99,
      variantIds: [4011, 4012, 4013],
      imageId: 'img_abc',
      title: 'Coffee You Later Funny T-Shirt',
      description: 'A funny coffee tee',
      tags: ['coffee', 'funny', 'tee'],
    });
    expect(r.productId).toBe('prod_xyz');
    const [path, opts] = vi.mocked(printifyFetch).mock.calls[0];
    expect(path).toBe('/shops/27519707/products.json');
    const body = (opts as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      blueprint_id: 6,
      print_provider_id: 99,
      title: 'Coffee You Later Funny T-Shirt',
      tags: ['coffee', 'funny', 'tee'],
    });
    expect((body.variants as Array<unknown>)).toHaveLength(3);
    expect((body.print_areas as Array<{ placeholders: Array<{ images: Array<{ id: string }> }> }>)[0]
      .placeholders[0].images[0].id).toBe('img_abc');
  });
});
