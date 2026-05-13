import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/printify/upload-image', () => ({ uploadImageByUrl: vi.fn() }));
vi.mock('@/lib/printify/create-product', () => ({ createProduct: vi.fn() }));
vi.mock('@/lib/printify/publish-product', () => ({ publishProduct: vi.fn() }));
vi.mock('@/lib/printify/get-product', () => ({ getProduct: vi.fn() }));

import { uploadImageByUrl } from '@/lib/printify/upload-image';
import { createProduct } from '@/lib/printify/create-product';
import { publishProduct } from '@/lib/printify/publish-product';
import { getProduct } from '@/lib/printify/get-product';
import { runPublish } from '@/lib/publish/publish-design';

const baseInput = {
  designImageUrl: 'https://blob.example/design.png',
  fileName: 'design.png',
  blueprintId: 6,
  printProviderId: 99,
  variantIds: [4011, 4012],
  title: 'Test Title',
  description: 'Test description over 20 chars long.',
  tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13'],
  pollIntervalMs: 1,
  pollTimeoutMs: 50,
};

describe('runPublish', () => {
  it('returns live when external_handle appears within poll window', async () => {
    vi.mocked(uploadImageByUrl).mockResolvedValueOnce({ imageId: 'img_1', previewUrl: '', width: 0, height: 0 });
    vi.mocked(createProduct).mockResolvedValueOnce({ productId: 'prod_1' });
    vi.mocked(publishProduct).mockResolvedValueOnce(undefined);
    vi.mocked(getProduct)
      .mockResolvedValueOnce({ productId: 'prod_1', etsyListingId: null, etsyUrl: null, visible: false })
      .mockResolvedValueOnce({ productId: 'prod_1', etsyListingId: '99', etsyUrl: 'https://etsy.com/listing/99', visible: true });

    const r = await runPublish(baseInput);
    expect(r.status).toBe('live');
    if (r.status === 'live') {
      expect(r.etsyListingId).toBe('99');
      expect(r.printifyProductId).toBe('prod_1');
    }
  });

  it('returns publishing_slow when poll times out', async () => {
    vi.mocked(uploadImageByUrl).mockResolvedValueOnce({ imageId: 'img_1', previewUrl: '', width: 0, height: 0 });
    vi.mocked(createProduct).mockResolvedValueOnce({ productId: 'prod_1' });
    vi.mocked(publishProduct).mockResolvedValueOnce(undefined);
    vi.mocked(getProduct).mockResolvedValue({ productId: 'prod_1', etsyListingId: null, etsyUrl: null, visible: false });

    const r = await runPublish({ ...baseInput, pollTimeoutMs: 10 });
    expect(r.status).toBe('publishing_slow');
    if (r.status === 'publishing_slow') {
      expect(r.printifyProductId).toBe('prod_1');
    }
  });

  it('throws when image upload fails', async () => {
    vi.mocked(uploadImageByUrl).mockRejectedValueOnce(new Error('printify 422'));
    await expect(runPublish(baseInput)).rejects.toThrow(/printify 422/);
  });
});
