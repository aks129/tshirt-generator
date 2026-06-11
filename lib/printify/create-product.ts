import { printifyFetch, shopPath } from './client';
import type { MasterProductSpec } from './master-product';
import { applyDynamicPricing } from '@/lib/publish/dynamic-pricing';

export type CreatedProduct = {
  productId: string;
};

/** Creates a new Printify product by cloning a master's blueprint, provider,
 *  variants (with per-variant pricing preserved), and print-area layout, then
 *  swapping every print-area's image ID for the freshly uploaded design.
 *
 *  This is the new primary path. The legacy from-settings path is gone — the
 *  master-template picker in /settings is now the only source of truth for
 *  what shirt + colors + sizes + prices a published listing uses. */
export async function createProductFromMaster(opts: {
  master: MasterProductSpec;
  imageId: string;
  title: string;
  description: string;
  tags: string[];
  /** When set, shifts every variant's price by (basePriceCents - master's
   *  lowest variant price) so Etsy's "from $X.XX" displays this number,
   *  while size upcharges from the master are preserved. */
  basePriceCents?: number | null;
}): Promise<CreatedProduct> {
  const { master, imageId } = opts;
  const pricedVariants = applyDynamicPricing(master.variants, opts.basePriceCents ?? null);

  const body = {
    title: opts.title,
    description: opts.description,
    blueprint_id: master.blueprintId,
    print_provider_id: master.printProviderId,
    tags: opts.tags,
    variants: pricedVariants.map((v) => ({
      id: v.id,
      price: v.price,
      is_enabled: v.isEnabled,
    })),
    // Drop placeholders the master has defined but never populated with an
    // image (e.g. blueprint exposes back/sleeve/neck print areas but the
    // operator only placed art on the front). Printify rejects empty
    // `images: []` arrays with a 400 'images field is required'.
    print_areas: master.printAreas.map((pa) => ({
      variant_ids: pa.variantIds,
      placeholders: pa.placeholders
        .filter((ph) => ph.images.length > 0)
        .map((ph) => ({
          position: ph.position,
          images:
            ph.images.length === 1
              ? ph.images.map((img) => ({
                  // Preserve the master's x/y/scale/angle exactly — they came
                  // from a product the operator already approved. Only swap
                  // the image id.
                  id: imageId,
                  x: img.x,
                  y: img.y,
                  scale: img.scale,
                  angle: img.angle,
                }))
              : // Master design was composed of multiple editor layers (e.g.
                // typography assembled in Printify's editor). Swapping every
                // layer's id would stamp our single design once per layer, so
                // collapse to one full-area centered placement instead.
                [{ id: imageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
        })),
    })),
    ...(master.salesChannelProperties && {
      sales_channel_properties: master.salesChannelProperties,
    }),
  };

  const r = await printifyFetch<{ id: string }>(shopPath('/products.json'), {
    method: 'POST',
    body,
  });
  return { productId: r.id };
}
