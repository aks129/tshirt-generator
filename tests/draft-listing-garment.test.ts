// tests/draft-listing-garment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settingsFindFirst = vi.fn();
const designsFindFirst = vi.fn();
const dbUpdate = vi.fn((..._a: unknown[]) => ({ set: () => ({ where: vi.fn() }) }));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      settings: { findFirst: (...a: unknown[]) => settingsFindFirst(...a) },
      designs: { findFirst: (...a: unknown[]) => designsFindFirst(...a) },
    },
    update: (...a: unknown[]) => dbUpdate(...a),
  },
}));
vi.mock('@/lib/printify/master-product', () => ({ fetchMasterProduct: vi.fn() }));
vi.mock('@/lib/printify/garment-descriptor', () => ({ getGarmentDescriptor: vi.fn() }));
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy: vi.fn() }));
vi.mock('@/lib/events', () => ({ logEvent: vi.fn() }));
// Ownership guard is exercised by its own tests; here it always passes.
vi.mock('@/lib/auth/ownership', () => ({ requireOwnedDesign: vi.fn(async () => ({ id: 'd1', batchId: 'b1' })) }));

import { POST } from '@/app/api/designs/[id]/draft-listing/route';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { draftListingCopy } from '@/lib/ai/listing-copy';

beforeEach(() => {
  vi.clearAllMocks();
  designsFindFirst.mockResolvedValue({ id: 'd1', batchId: 'b1', concept: { headline: 'Cat Mom Energy' }, listingDraft: null });
  settingsFindFirst.mockResolvedValue({ masterPrintifyProductId: 'p1' });
  vi.mocked(fetchMasterProduct).mockResolvedValue({ blueprintId: 6 } as never);
  vi.mocked(getGarmentDescriptor).mockResolvedValue('Bella+Canvas 3001');
  vi.mocked(draftListingCopy).mockResolvedValue({ title: 't', tags: [], description: 'd', source: 'gemini' } as never);
});

describe('draft-listing route garment resolution', () => {
  it('passes the resolved garment to draftListingCopy', async () => {
    const res = await POST(new Request('http://x/api/designs/d1/draft-listing', { method: 'POST' }), { params: Promise.resolve({ id: 'd1' }) });
    expect(res.status).toBe(200);
    expect(draftListingCopy).toHaveBeenCalledWith({ slogan: 'Cat Mom Energy', garment: 'Bella+Canvas 3001' });
  });

  it('still drafts (garment undefined) when master lookup throws', async () => {
    vi.mocked(fetchMasterProduct).mockRejectedValue(new Error('printify down'));
    await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'd1' }) });
    expect(draftListingCopy).toHaveBeenCalledWith({ slogan: 'Cat Mom Energy', garment: undefined });
  });
});
