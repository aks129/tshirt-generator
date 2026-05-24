// Minimal Printify v1 client. Requires PRINTIFY_API_TOKEN in env.
// Docs: https://developers.printify.com/

const BASE = 'https://api.printify.com/v1';

function token(): string {
  const t = process.env.PRINTIFY_API_TOKEN;
  if (!t) throw new Error('PRINTIFY_API_TOKEN is not set');
  return t;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'tshirt-generator',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Printify ${init.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export type PrintifyShop = { id: number; title: string; sales_channel: string };
export type PrintifyBlueprint = { id: number; title: string; brand: string; model: string };
export type PrintifyPrintProvider = { id: number; title: string };
export type PrintifyVariant = {
  id: number;
  title: string;
  options: Record<string, string>;
  placeholders: { position: string; width: number; height: number }[];
  // cost is in cents and varies by provider — Printify returns it nested
};
export type PrintifyVariantsResponse = {
  id: number;
  title: string;
  variants: (PrintifyVariant & { cost: number; price?: number })[];
};

export type PrintifyUpload = { id: string; file_name: string; preview_url: string; width: number; height: number };

export type PrintifyProductMockup = {
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
};
export type PrintifyProduct = {
  id: string;
  title: string;
  images: PrintifyProductMockup[];
  visible: boolean;
};

export async function listShops(): Promise<PrintifyShop[]> {
  return req<PrintifyShop[]>('/shops.json');
}

export async function listBlueprints(): Promise<PrintifyBlueprint[]> {
  return req<PrintifyBlueprint[]>('/catalog/blueprints.json');
}

export async function listPrintProviders(blueprintId: number): Promise<PrintifyPrintProvider[]> {
  return req<PrintifyPrintProvider[]>(`/catalog/blueprints/${blueprintId}/print_providers.json`);
}

export async function listVariants(blueprintId: number, providerId: number): Promise<PrintifyVariantsResponse> {
  return req<PrintifyVariantsResponse>(
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`,
  );
}

export async function uploadImageByUrl(opts: { fileName: string; url: string }): Promise<PrintifyUpload> {
  return req<PrintifyUpload>('/uploads/images.json', {
    method: 'POST',
    body: JSON.stringify({ file_name: opts.fileName, url: opts.url }),
  });
}

export type CreateProductInput = {
  shopId: number;
  title: string;
  description: string;
  blueprintId: number;
  printProviderId: number;
  variantIds: number[];
  priceCents: number;
  uploadId: string;
  tags?: string[];
};

export async function createProduct(input: CreateProductInput): Promise<PrintifyProduct> {
  const variants = input.variantIds.map((id) => ({
    id,
    price: input.priceCents,
    is_enabled: true,
  }));

  const body = {
    title: input.title,
    description: input.description,
    blueprint_id: input.blueprintId,
    print_provider_id: input.printProviderId,
    variants,
    print_areas: [
      {
        variant_ids: input.variantIds,
        placeholders: [
          {
            position: 'front',
            images: [
              {
                id: input.uploadId,
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
    tags: input.tags ?? [],
  };

  return req<PrintifyProduct>(`/shops/${input.shopId}/products.json`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getProduct(shopId: number, productId: string): Promise<PrintifyProduct> {
  return req<PrintifyProduct>(`/shops/${shopId}/products/${productId}.json`);
}

// Pushes a product to the shop's connected sales channel (Etsy, Shopify, etc).
// Printify handles the channel-specific OAuth and listing creation for us.
// Per https://developers.printify.com/#publish-a-product
export async function publishProductToChannel(opts: {
  shopId: number;
  productId: string;
  // Toggle which fields are sent to the channel. All true by default.
  fields?: { title?: boolean; description?: boolean; images?: boolean; variants?: boolean; tags?: boolean; keyFeatures?: boolean; shipping_template?: boolean };
}): Promise<{ ok: true }> {
  const body = {
    title: opts.fields?.title ?? true,
    description: opts.fields?.description ?? true,
    images: opts.fields?.images ?? true,
    variants: opts.fields?.variants ?? true,
    tags: opts.fields?.tags ?? true,
    keyFeatures: opts.fields?.keyFeatures ?? true,
    shipping_template: opts.fields?.shipping_template ?? true,
  };
  await req(`/shops/${opts.shopId}/products/${opts.productId}/publish.json`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { ok: true };
}
