import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
}));

import { printifyFetch } from '@/lib/printify/client';
import { uploadImageByUrl } from '@/lib/printify/upload-image';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

describe('uploadImageByUrl', () => {
  it('POSTs the image URL and returns image id', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'img_abc123',
      file_name: 'design.png',
      width: 3000,
      height: 3600,
      size: 123456,
      mime_type: 'image/png',
      preview_url: 'https://printify.example/preview.png',
      upload_time: '2026-05-12 20:00:00',
    });
    const r = await uploadImageByUrl({ fileName: 'design.png', url: 'https://blob.example/design.png' });
    expect(r.imageId).toBe('img_abc123');
    expect(printifyFetch).toHaveBeenCalledWith('/uploads/images.json', expect.objectContaining({
      method: 'POST',
      body: { file_name: 'design.png', url: 'https://blob.example/design.png' },
    }));
  });
});
