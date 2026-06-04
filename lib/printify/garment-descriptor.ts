import { fetchBlueprintDetail } from './catalog';

/** Human-readable garment identity for listing copy, derived from a master
 *  product's blueprint (brand + model, e.g. "Bella+Canvas 3001"). Falls back to
 *  the blueprint title. Returns null on failure so the copy generator can apply
 *  its own safe default. */
export async function getGarmentDescriptor(blueprintId: number): Promise<string | null> {
  try {
    const bp = await fetchBlueprintDetail(blueprintId);
    const brandModel = [bp.brand, bp.model].filter(Boolean).join(' ').trim();
    if (brandModel) return brandModel;
    if (bp.title?.trim()) return bp.title.trim();
  } catch {
    /* fall through to null */
  }
  return null;
}
