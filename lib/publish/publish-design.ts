import { uploadImageByUrl } from '@/lib/printify/upload-image';
import { createProduct } from '@/lib/printify/create-product';
import { publishProduct } from '@/lib/printify/publish-product';
import { getProduct } from '@/lib/printify/get-product';

export type PublishResult =
  | { status: 'live'; printifyProductId: string; etsyListingId: string; etsyUrl: string }
  | { status: 'publishing_slow'; printifyProductId: string };

export async function runPublish(input: {
  designImageUrl: string;
  fileName: string;
  blueprintId: number;
  printProviderId: number;
  variantIds: number[];
  title: string;
  description: string;
  tags: string[];
  priceCents?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  preCreatedProductId?: string;
}): Promise<PublishResult> {
  const pollInterval = input.pollIntervalMs ?? 3000;
  const pollTimeout = input.pollTimeoutMs ?? 30_000;

  let productId = input.preCreatedProductId;

  if (!productId) {
    const upload = await uploadImageByUrl({ fileName: input.fileName, url: input.designImageUrl });

    const created = await createProduct({
      blueprintId: input.blueprintId,
      printProviderId: input.printProviderId,
      variantIds: input.variantIds,
      imageId: upload.imageId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      priceCents: input.priceCents,
    });
    productId = created.productId;
  }

  await publishProduct(productId);

  const start = Date.now();
  while (Date.now() - start < pollTimeout) {
    const status = await getProduct(productId);
    if (status.etsyListingId && status.etsyUrl) {
      return {
        status: 'live',
        printifyProductId: productId,
        etsyListingId: status.etsyListingId,
        etsyUrl: status.etsyUrl,
      };
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return { status: 'publishing_slow', printifyProductId: productId };
}
