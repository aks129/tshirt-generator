import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '12345678'),
  shopPath: vi.fn((s: string) => `/shops/12345678${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { createProductFromMaster } from '@/lib/printify/create-product';
import type { MasterProductSpec } from '@/lib/printify/master-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '12345678');
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(path).toBe('/shops/12345678/products.json');
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

  it('drops placeholders the master defined but never put an image on (Printify 400 on empty images)', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_new' });
    await createProductFromMaster({
      master: {
        ...sampleMaster,
        printAreas: [{
          variantIds: [4011],
          placeholders: [
            { position: 'front', images: [{ id: 'm', x: 0.5, y: 0.5, scale: 1, angle: 0 }] },
            { position: 'back', images: [] },
            { position: 'sleeve_left', images: [] },
          ],
        }],
      },
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    const printAreas = (body as { print_areas: Array<{ placeholders: Array<{ position: string }> }> }).print_areas;
    expect(printAreas[0].placeholders).toHaveLength(1);
    expect(printAreas[0].placeholders[0].position).toBe('front');
  });

  it('includes sales_channel_properties in POST body when master has it', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_scp' });
    await createProductFromMaster({
      master: {
        ...sampleMaster,
        salesChannelProperties: { etsy: { shipping_template_id: 12345, taxonomy_id: 1000 } },
      },
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      sales_channel_properties: { etsy: { shipping_template_id: 12345, taxonomy_id: 1000 } },
    });
  });

  it('omits sales_channel_properties when master has none', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_no_scp' });
    await createProductFromMaster({
      master: sampleMaster,
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('sales_channel_properties');
  });

  it('collapses a multi-layer placeholder into one centered placement (no 6x stamped design)', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_multi' });
    await createProductFromMaster({
      master: {
        ...sampleMaster,
        printAreas: [{
          variantIds: [4011],
          placeholders: [{
            position: 'front',
            // Master design composed of 6 editor layers (real case: typography
            // built in Printify's editor). Swapping each layer's id would stamp
            // our design 6 times.
            images: [
              { id: 'l0', x: 0.491, y: 0.044, scale: 0.254, angle: 0 },
              { id: 'l1', x: 0.489, y: 0.174, scale: 0.464, angle: 0 },
              { id: 'l2', x: 0.491, y: 0.27, scale: 0.543, angle: 0 },
              { id: 'l3', x: 0.491, y: 0.054, scale: 0.049, angle: 0 },
              { id: 'l4', x: 0.491, y: 0.082, scale: 0.065, angle: 0 },
              { id: 'l5', x: 0.491, y: 0.37, scale: 0.341, angle: 0 },
            ],
          }],
        }],
      },
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    const printAreas = (body as { print_areas: Array<{ placeholders: Array<{ images: Array<{ id: string; x: number; y: number; scale: number; angle: number }> }> }> }).print_areas;
    expect(printAreas[0].placeholders[0].images).toEqual([
      { id: 'img_new', x: 0.5, y: 0.5, scale: 1, angle: 0 },
    ]);
  });

  it('preserves master placement when placeholder has exactly one image', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_single' });
    await createProductFromMaster({
      master: sampleMaster,
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    const printAreas = (body as { print_areas: Array<{ placeholders: Array<{ images: Array<{ id: string; x: number; y: number; scale: number }> }> }> }).print_areas;
    expect(printAreas[0].placeholders[0].images).toHaveLength(1);
    expect(printAreas[0].placeholders[0].images[0]).toMatchObject({ id: 'img_new', x: 0.5, y: 0.42, scale: 0.88 });
  });
});
