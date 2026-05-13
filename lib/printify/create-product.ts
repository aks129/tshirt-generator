import { printifyFetch, shopPath } from './client';

export type CreatedProduct = {
  productId: string;
};

const DEFAULT_PRICE_CENTS = 2499;

export async function createProduct(opts: {
  blueprintId: number;
  printProviderId: number;
  variantIds: number[];
  imageId: string;
  title: string;
  description: string;
  tags: string[];
  priceCents?: number;
}): Promise<CreatedProduct> {
  const price = opts.priceCents ?? DEFAULT_PRICE_CENTS;
  const body = {
    title: opts.title,
    description: opts.description,
    blueprint_id: opts.blueprintId,
    print_provider_id: opts.printProviderId,
    tags: opts.tags,
    variants: opts.variantIds.map((id) => ({ id, price, is_enabled: true })),
    print_areas: [
      {
        variant_ids: opts.variantIds,
        placeholders: [
          {
            position: 'front',
            images: [
              {
                id: opts.imageId,
                x: 0.5,
                y: 0.5,
                scale: 1,
                angle: 0,
              },
            ],
          },
        ],
      },
    ],
  };

  const r = await printifyFetch<{ id: string }>(shopPath('/products.json'), {
    method: 'POST',
    body,
  });
  return { productId: r.id };
}
