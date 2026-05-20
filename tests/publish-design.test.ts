import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/upload-image', () => ({ uploadImageByUrl: vi.fn() }));
vi.mock('@/lib/printify/create-product', () => ({ createProductFromMaster: vi.fn() }));
vi.mock('@/lib/printify/publish-product', () => ({ publishProduct: vi.fn() }));
vi.mock('@/lib/printify/get-product', () => ({ getProduct: vi.fn() }));
vi.mock('@/lib/printify/master-product', () => ({ fetchMasterProduct: vi.fn() }));

import { uploadImageByUrl } from '@/lib/printify/upload-image';
import { createProductFromMaster } from '@/lib/printify/create-product';
import { publishProduct } from '@/lib/printify/publish-product';
import { getProduct } from '@/lib/printify/get-product';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { runPublish } from '@/lib/publish/publish-design';

const masterStub = {
  productId: 'master_id',
  title: 'Master',
  blueprintId: 145,
  printProviderId: 1,
  variants: [{ id: 4011, price: 2299, isEnabled: true }],
  printAreas: [{
    variantIds: [4011],
    placeholders: [{ position: 'front', images: [{ id: 'old_img', x: 0.5, y: 0.5, scale: 1, angle: 0 }] }],
  }],
  thumbnailUrl: null,
};

const baseInput = {
  designImageUrl: 'https://blob.example/design.png',
  fileName: 'design.png',
  masterProductId: 'master_id',
  title: 'Test Title',
  description: 'Test description over 20 chars long.',
  tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13'],
  pollIntervalMs: 1,
  pollTimeoutMs: 50,
};

describe('runPublish', () => {
  beforeEach(() => {
    vi.mocked(fetchMasterProduct).mockReset();
    vi.mocked(uploadImageByUrl).mockReset();
    vi.mocked(createProductFromMaster).mockReset();
    vi.mocked(publishProduct).mockReset();
    vi.mocked(getProduct).mockReset();
  });

  it('returns live when external_handle appears within poll window', async () => {
    vi.mocked(fetchMasterProduct).mockResolvedValueOnce(masterStub);
    vi.mocked(uploadImageByUrl).mockResolvedValueOnce({ imageId: 'img_1', previewUrl: '', width: 0, height: 0 });
    vi.mocked(createProductFromMaster).mockResolvedValueOnce({ productId: 'prod_1' });
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
    vi.mocked(fetchMasterProduct).mockResolvedValueOnce(masterStub);
    vi.mocked(uploadImageByUrl).mockResolvedValueOnce({ imageId: 'img_2', previewUrl: '', width: 0, height: 0 });
    vi.mocked(createProductFromMaster).mockResolvedValueOnce({ productId: 'prod_2' });
    vi.mocked(publishProduct).mockResolvedValueOnce(undefined);
    vi.mocked(getProduct).mockResolvedValue({ productId: 'prod_2', etsyListingId: null, etsyUrl: null, visible: false });

    const r = await runPublish({ ...baseInput, pollTimeoutMs: 10 });
    expect(r.status).toBe('publishing_slow');
  });

  it('skips create when a preCreatedProductId is supplied (retry path)', async () => {
    vi.mocked(publishProduct).mockResolvedValueOnce(undefined);
    vi.mocked(getProduct).mockResolvedValueOnce({ productId: 'prod_3', etsyListingId: '7', etsyUrl: 'https://etsy.com/listing/7', visible: true });

    const r = await runPublish({ ...baseInput, preCreatedProductId: 'prod_3' });
    expect(r.status).toBe('live');
    expect(vi.mocked(fetchMasterProduct)).not.toHaveBeenCalled();
    expect(vi.mocked(createProductFromMaster)).not.toHaveBeenCalled();
  });
});
