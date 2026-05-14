import type { MockupBase } from '@/public/mockup-bases/manifest';

type PrintifyVariant = {
  id: number;
  options?: { color?: string; size?: string };
};

// Maps a Printify color-option string (e.g. "Athletic Heather") to our manifest
// color enum. Returns null if we can't classify — those variants are ignored
// for filtering purposes.
function normalizeColor(printifyColor: string): MockupBase['color'] | null {
  const lc = printifyColor.toLowerCase();
  if (lc.includes('black')) return 'black';
  if (lc.includes('white')) return 'white';
  if (lc.includes('heather')) return 'heather';
  if (lc.includes('navy')) return 'navy';
  if (lc.includes('charcoal')) return 'charcoal';
  return null;
}

export async function fetchConfiguredColors(opts: {
  blueprintId: number;
  providerId: number;
  variantIds: number[];
}): Promise<Set<MockupBase['color']>> {
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) return new Set();

  const url = `https://api.printify.com/v1/catalog/blueprints/${opts.blueprintId}/print_providers/${opts.providerId}/variants.json`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return new Set();

  const json = (await resp.json()) as { variants?: PrintifyVariant[] };
  const variantsById = new Map<number, PrintifyVariant>();
  for (const v of json.variants ?? []) variantsById.set(v.id, v);

  const colors = new Set<MockupBase['color']>();
  for (const id of opts.variantIds) {
    const v = variantsById.get(id);
    const colorName = v?.options?.color;
    if (!colorName) continue;
    const normalized = normalizeColor(colorName);
    if (normalized) colors.add(normalized);
  }
  return colors;
}
