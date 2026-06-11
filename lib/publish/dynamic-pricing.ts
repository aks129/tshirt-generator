import type { MasterProductSpec } from '@/lib/printify/master-product';

/** Shifts every variant's price by a constant delta so the *lowest* variant
 *  hits `basePriceCents`, while size upcharges (2XL/3XL/4XL premiums baked
 *  into the master) are preserved.
 *
 *  Why this shape: Etsy displays "from $X.XX" using the lowest variant. We
 *  want $X.XX to be the AI-recommended best price for this design (median
 *  of competing tees minus our priceOffset). At the same time we don't want
 *  to flatten the upsize curve — 3XL costs the operator more, so it should
 *  still cost the buyer more.
 *
 *  Fallback: if no recommendation is available (no comps for the niche),
 *  the master's prices pass through unchanged. */
export function applyDynamicPricing(
  variants: MasterProductSpec['variants'],
  basePriceCents: number | null,
): MasterProductSpec['variants'] {
  if (basePriceCents == null) return variants;
  if (variants.length === 0) return variants;

  const minMasterPrice = variants.reduce(
    (min, v) => (v.price < min ? v.price : min),
    Infinity,
  );
  const delta = basePriceCents - minMasterPrice;
  if (delta === 0) return variants;

  return variants.map((v) => ({
    ...v,
    // max() with master's floor prevents going below master's price when the
    // recommendation comes in absurdly low (e.g. niche with cheap competitors).
    price: Math.max(v.price + delta, minMasterPrice),
  }));
}
