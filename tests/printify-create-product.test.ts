import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '27519707'),
  shopPath: vi.fn((s: string) => `/shops/27519707${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { createProductFromMaster } from '@/lib/printify/create-product';
import type { MasterProductSpec } from '@/lib/printify/master-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

const sampleMaster: MasterProductSpec = {
  productId: 'master_abc',
  title: 'Master template — Comfort Colors 1717',
  blueprintId: 145,
  printProviderId: 1,
  variants: [
    { id: 4011, price: 2299, isEnabled: true },
    { id: 4012, price: 2499, isEnabled: true },
    { id: 4013, price: 2699, isEnabled: true },
  ],
  printAreas: [
    {
      variantIds: [4011, 4012, 4013],
      placeholders: [
        {
          position: 'front',
          images: [
            { id: 'master_img_xxx', x: 0.5, y: 0.42, scale: 0.88, angle: 0 },
          ],
        },
      ],
    },
  ],
  thumbnailUrl: 'https://images.printify.com/master.jpg',
};

describe('createProductFromMaster', () => {
  it('clones blueprint, provider, variants (with prices), and print_areas; swaps image id', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_new' });
    const r = await createProductFromMaster({
      master: sampleMaster,
      imageId: 'img_new',
      title: 'New design title',
      description: 'New description text long enough to be valid.',
      tags: ['a', 'b'],
    });
    expect(r.productId).toBe('prod_new');

    const [path, opts] = vi.mocked(printifyFetch).mock.calls[0];
    expect(path).toBe('/shops/27519707/products.json');
    const body = (opts as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      blueprint_id: 145,
      print_provider_id: 1,
      title: 'New design title',
      variants: [
        { id: 4011, price: 2299, is_enabled: true },
        { id: 4012, price: 2499, is_enabled: true },
        { id: 4013, price: 2699, is_enabled: true },
      ],
    });
    const printAreas = (body as { print_areas: Array<{ placeholders: Array<{ images: Array<{ id: string; x: number; scale: number }> }> }> }).print_areas;
    expect(printAreas[0].placeholders[0].images[0].id).toBe('img_new');
    // Preserves master's positioning
    expect(printAreas[0].placeholders[0].images[0].x).toBe(0.5);
    expect(printAreas[0].placeholders[0].images[0].scale).toBe(0.88);
  });
});
