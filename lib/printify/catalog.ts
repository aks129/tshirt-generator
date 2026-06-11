import { printifyFetch } from './client';
import { db } from '@/lib/db/client';
import { printifyCatalogCache } from '@/lib/db/schema';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type Blueprint = { id: number; title: string; brand?: string; model?: string };
export type Provider = { id: number; title: string };
export type Variant = { id: number; title: string; color: string; size: string };

const DEFAULT_BLUEPRINT_ID = 6; // Bella+Canvas 3001

export async function getCatalog(): Promise<{ blueprints: Blueprint[]; providers: Provider[] }> {
  const cached = await db.query.printifyCatalogCache.findFirst();
  const isFresh = cached && cached.fetchedAt.getTime() > Date.now() - CACHE_TTL_MS;
  if (isFresh && cached) {
    return {
      blueprints: cached.blueprints as Blueprint[],
      providers: cached.providers as Provider[],
    };
  }

  const blueprints = await printifyFetch<Blueprint[]>('/catalog/blueprints.json');
  const providers = await printifyFetch<Provider[]>(
    `/catalog/blueprints/${DEFAULT_BLUEPRINT_ID}/print_providers.json`,
  );

  await db
    .insert(printifyCatalogCache)
    .values({ id: 1, blueprints, providers, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: printifyCatalogCache.id,
      set: { blueprints, providers, fetchedAt: new Date() },
    });

  return { blueprints, providers };
}

export async function fetchBlueprintVariants(
  blueprintId: number,
  providerId: number,
): Promise<Variant[]> {
  const r = await printifyFetch<{
    variants: Array<{ id: number; title: string; options: { color?: string; size?: string } }>;
  }>(`/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`);
  return r.variants.map((v) => ({
    id: v.id,
    title: v.title,
    color: v.options.color ?? '',
    size: v.options.size ?? '',
  }));
}

// Printify exposes stock blueprint imagery on the blueprint endpoint itself.
// These tend to be one or two generic color variants (e.g. white + black) so
// they're useful as starting templates; operators upload their own for other
// colors. Returned shape:
//   { title, brand, model, images: string[] }
export async function fetchBlueprintDetail(blueprintId: number): Promise<{
  id: number; title: string; brand?: string; model?: string; images: string[];
}> {
  const r = await printifyFetch<{
    id: number;
    title: string;
    brand?: string;
    model?: string;
    images?: string[];
  }>(`/catalog/blueprints/${blueprintId}.json`);
  return {
    id: r.id,
    title: r.title,
    brand: r.brand,
    model: r.model,
    images: r.images ?? [],
  };
}
