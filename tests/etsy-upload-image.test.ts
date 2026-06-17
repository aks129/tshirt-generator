import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadEtsyListingImage } from '@/lib/mockups/upload-to-etsy';
import { EtsyUploadError } from '@/lib/etsy/errors';

beforeEach(() => {
  vi.stubEnv('ETSY_API_KEY', 'kkk');
  vi.stubEnv('ETSY_SHARED_SECRET', 'sss');
});

describe('uploadEtsyListingImage', () => {
  it('POSTs multipart with Bearer + x-api-key headers, returns parsed listing_image_id', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ listing_image_id: 1234567, url_fullxfull: 'https://i.etsy/full' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const r = await uploadEtsyListingImage({
      accessToken: 'abc.token',
      shopId: 87654321,
      listingId: '4444455555',
      imageBuffer: Buffer.from('JPEGBYTES'),
      filename: 'design_1.jpg',
      rank: 2,
      altText: 'flat lay',
    });

    expect(r.listingImageId).toBe(1234567);
    expect(r.url).toBe('https://i.etsy/full');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://openapi.etsy.com/v3/application/shops/87654321/listings/4444455555/images');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer abc.token');
    expect(headers['x-api-key']).toBe('kkk:sss');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('throws EtsyUploadError with status + body on non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"error":"image too large"}', { status: 413 }),
    );

    await expect(
      uploadEtsyListingImage({
        accessToken: 't', shopId: 1, listingId: '1',
        imageBuffer: Buffer.from('x'), filename: 'x.jpg', rank: 1, altText: 'x',
      }),
    ).rejects.toMatchObject({
      name: 'EtsyUploadError',
      status: 413,
      body: '{"error":"image too large"}',
    });
  });

  it('retries on 429 with Retry-After header and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ listing_image_id: 9999, url_fullxfull: 'https://img.etsy/x' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const promise = uploadEtsyListingImage({
      accessToken: 't', shopId: 1, listingId: '1',
      imageBuffer: Buffer.from('x'), filename: 'x.jpg', rank: 1, altText: 'x',
    });
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.listingImageId).toBe(9999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws EtsyUploadError after exhausting 3 retries all returning 429', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const promise = uploadEtsyListingImage({
      accessToken: 't', shopId: 1, listingId: '1',
      imageBuffer: Buffer.from('x'), filename: 'x.jpg', rank: 1, altText: 'x',
    });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'EtsyUploadError', status: 429 });
    await vi.runAllTimersAsync();
    await assertion;
    // 1 initial call + 3 retries, then give up — the loop is bounded.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
