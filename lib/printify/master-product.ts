import { printifyFetch, shopPath } from './client';

// Spec we extract from a master Printify product and replay when creating a
// new product with our design. We deliberately keep only the fields needed for
// 1:1 reproduction — colors/sizes, per-variant pricing, image placement on
// every print area, and a couple of human-readable bits for the picker UI.

export type MasterPrintArea = {
  variantIds: number[];
  /** print_areas[].placeholders[] — each has a `position` ('front'/'back'/etc.)
   *  plus an `images[]` array with x/y/scale/angle. We copy the structure as
   *  the master defines it and only swap the image `id` in createProduct. */
  placeholders: Array<{
    position: string;
    images: Array<{
      id: string;
      x: number;
      y: number;
      scale: number;
      angle: number;
    }>;
  }>;
};

export type MasterProductSpec = {
  productId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  /** Variants enabled by the master; price is the master's per-variant
   *  Printify price in cents. */
  variants: Array<{ id: number; price: number; isEnabled: boolean }>;
  printAreas: MasterPrintArea[];
  /** Stock illustration / mockup imagery from the master, returned so the
   *  picker can render a thumbnail. */
  thumbnailUrl: string | null;
};

type PrintifyProductResp = {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{ id: number; price: number; is_enabled?: boolean; is_default?: boolean }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images: Array<{ id: string; x: number; y: number; scale: number; angle: number }>;
    }>;
  }>;
  images?: Array<{ src: string; position?: string; is_default?: boolean }>;
};

export async function fetchMasterProduct(productId: string): Promise<MasterProductSpec> {
  const r = await printifyFetch<PrintifyProductResp>(shopPath(`/products/${productId}.json`));
  return {
    productId: r.id,
    title: r.title,
    blueprintId: r.blueprint_id,
    printProviderId: r.print_provider_id,
    variants: r.variants
      .filter((v) => v.is_enabled !== false)
      .map((v) => ({ id: v.id, price: v.price, isEnabled: v.is_enabled !== false })),
    printAreas: r.print_areas.map((pa) => ({
      variantIds: pa.variant_ids,
      placeholders: pa.placeholders.map((ph) => ({
        position: ph.position,
        images: ph.images,
      })),
    })),
    thumbnailUrl:
      r.images?.find((i) => i.is_default)?.src ??
      r.images?.find((i) => i.position === 'front')?.src ??
      r.images?.[0]?.src ??
      null,
  };
}
