import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '27519707'),
  shopPath: vi.fn((s: string) => `/shops/27519707${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { fetchMasterProduct } from '@/lib/printify/master-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

const baseResp = {
  id: 'p1',
  title: 'Test master',
  blueprint_id: 145,
  print_provider_id: 1,
  variants: [{ id: 1, price: 2000, is_enabled: true }],
  print_areas: [],
};

describe('fetchMasterProduct — salesChannelProperties', () => {
  it('extracts sales_channel_properties when present', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      ...baseResp,
      sales_channel_properties: { etsy: { shipping_template_id: 99, taxonomy_id: 42 } },
    });
    const spec = await fetchMasterProduct('p1');
    expect(spec.salesChannelProperties).toEqual({ etsy: { shipping_template_id: 99, taxonomy_id: 42 } });
  });

  it('sets salesChannelProperties to undefined when absent', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce(baseResp);
    const spec = await fetchMasterProduct('p1');
    expect(spec.salesChannelProperties).toBeUndefined();
  });
});
