import { printifyFetch, shopPath } from './client';

export type PrintifyProductSummary = {
  id: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  variantCount: number;
  visible: boolean;
  thumbnailUrl: string | null;
};

type ListResp = {
  current_page: number;
  last_page: number;
  total: number;
  data: Array<{
    id: string;
    title: string;
    blueprint_id: number;
    print_provider_id: number;
    visible?: boolean;
    variants?: Array<{ is_enabled?: boolean }>;
    images?: Array<{ src: string; is_default?: boolean; position?: string }>;
  }>;
};

/** Pulls up to 50 of the seller's most recent Printify products. Used by
 *  the master-template picker — they pick one of these as the template that
 *  every new design clones. */
export async function listSellerProducts(): Promise<PrintifyProductSummary[]> {
  const r = await printifyFetch<ListResp>(shopPath('/products.json'), {
    query: { limit: '50', page: '1' },
  });
  return r.data.map((p) => ({
    id: p.id,
    title: p.title,
    blueprintId: p.blueprint_id,
    printProviderId: p.print_provider_id,
    variantCount: (p.variants ?? []).filter((v) => v.is_enabled !== false).length,
    visible: p.visible !== false,
    thumbnailUrl:
      p.images?.find((i) => i.is_default)?.src ??
      p.images?.find((i) => i.position === 'front')?.src ??
      p.images?.[0]?.src ??
      null,
  }));
}
