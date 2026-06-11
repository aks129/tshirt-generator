// tests/garment-descriptor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/catalog', () => ({
  fetchBlueprintDetail: vi.fn(),
}));

import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { fetchBlueprintDetail } from '@/lib/printify/catalog';

describe('getGarmentDescriptor', () => {
  beforeEach(() => vi.mocked(fetchBlueprintDetail).mockReset());

  it('returns "brand model" when both are present', async () => {
    vi.mocked(fetchBlueprintDetail).mockResolvedValue({
      id: 6, title: 'Unisex Jersey Short Sleeve Tee', brand: 'Bella+Canvas', model: '3001', images: [],
    });
    expect(await getGarmentDescriptor(6)).toBe('Bella+Canvas 3001');
  });

  it('falls back to the title when brand/model are missing', async () => {
    vi.mocked(fetchBlueprintDetail).mockResolvedValue({
      id: 9, title: 'Heavy Cotton Tee', images: [],
    });
    expect(await getGarmentDescriptor(9)).toBe('Heavy Cotton Tee');
  });

  it('returns null on fetch failure (caller applies its own default)', async () => {
    vi.mocked(fetchBlueprintDetail).mockRejectedValueOnce(new Error('boom'));
    expect(await getGarmentDescriptor(6)).toBeNull();
  });
});
