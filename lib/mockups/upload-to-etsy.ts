import { EtsyUploadError } from '@/lib/etsy/errors';

export async function uploadEtsyListingImage(opts: {
  accessToken: string;
  shopId: number;
  listingId: string;
  imageBuffer: Buffer;
  filename: string;
  rank: number;
  altText: string;
}): Promise<{ listingImageId: number; url: string }> {
  const apiKey = process.env.ETSY_API_KEY;
  const sharedSecret = process.env.ETSY_SHARED_SECRET;
  if (!apiKey || !sharedSecret) throw new Error('ETSY_API_KEY / ETSY_SHARED_SECRET not set');

  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(opts.imageBuffer)], { type: 'image/jpeg' }), opts.filename);
  form.append('rank', String(opts.rank));
  form.append('alt_text', opts.altText);
  form.append('overwrite', 'false');

  const url = `https://openapi.etsy.com/v3/application/shops/${opts.shopId}/listings/${opts.listingId}/images`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'x-api-key': `${apiKey}:${sharedSecret}`,
    },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new EtsyUploadError(resp.status, body);
  }
  const json = (await resp.json()) as { listing_image_id: number; url_fullxfull?: string; url_570xN?: string };
  return {
    listingImageId: json.listing_image_id,
    url: json.url_fullxfull ?? json.url_570xN ?? '',
  };
}
