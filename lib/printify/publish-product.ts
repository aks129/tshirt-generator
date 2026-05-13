import { printifyFetch, shopPath } from './client';

export async function publishProduct(productId: string): Promise<void> {
  await printifyFetch(shopPath(`/products/${productId}/publish.json`), {
    method: 'POST',
    body: { title: true, description: true, images: true, variants: true, tags: true },
  });
}
