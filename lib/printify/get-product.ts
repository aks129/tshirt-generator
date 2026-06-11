import { printifyFetch, shopPath } from './client';

type PrintifyProductResp = {
  id: string;
  title: string;
  visible?: boolean;
  is_locked?: boolean;
  external?: { id?: string; handle?: string } | null;
};

export async function getProduct(productId: string): Promise<{
  productId: string;
  etsyListingId: string | null;
  etsyUrl: string | null;
  visible: boolean;
  isLocked: boolean;
}> {
  const r = await printifyFetch<PrintifyProductResp>(shopPath(`/products/${productId}.json`));
  return {
    productId: r.id,
    etsyListingId: r.external?.id ?? null,
    etsyUrl: r.external?.handle ?? null,
    visible: r.visible ?? false,
    isLocked: r.is_locked ?? false,
  };
}
