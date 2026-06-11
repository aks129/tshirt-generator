import { fetchBlueprintVariants } from './catalog';

// Custom mockups composite the design onto a base scene. Light shirts need a
// black-text design multiplied on; dark shirts need an RGB-inverted design
// composited over. So all we need from the seller's configured variants is the
// set of *tones* they actually sell, which drives scene selection.

export type ShirtTone = 'light' | 'dark';

const DARK_TOKENS = ['black', 'navy', 'charcoal', 'forest', 'maroon', 'red', 'royal', 'purple', 'green', 'dark'];

/** Classify a Printify color-option string (e.g. "Athletic Heather", "Black")
 *  into a light/dark tone. Defaults to 'light' for unknown/empty. */
export function colorToTone(printifyColor: string): ShirtTone {
  const lc = printifyColor.toLowerCase();
  if (DARK_TOKENS.some((t) => lc.includes(t))) return 'dark';
  return 'light';
}

/** Returns the set of shirt tones the master product actually offers, derived
 *  from its enabled variant ids mapped through the blueprint catalog. Returns
 *  an empty set on any failure / missing config — callers should treat that as
 *  "unknown" and fall back to a light default. */
export async function fetchConfiguredTones(opts: {
  blueprintId: number;
  providerId: number;
  variantIds: number[];
}): Promise<Set<ShirtTone>> {
  const tones = new Set<ShirtTone>();
  if (!opts.variantIds.length) return tones;
  try {
    const catalog = await fetchBlueprintVariants(opts.blueprintId, opts.providerId);
    const colorById = new Map(catalog.map((v) => [v.id, v.color]));
    for (const id of opts.variantIds) {
      const color = colorById.get(id);
      if (color) tones.add(colorToTone(color));
    }
  } catch {
    /* unknown — caller falls back to light default */
  }
  return tones;
}
