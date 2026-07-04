// Sales-per-listing from the seller's paid receipts. Requires the
// `transactions_r` OAuth scope (tokens granted before that scope was added
// will 403 — callers treat that as "sales unknown", not an error).

const PAGE_SIZE = 100;
// Enough for years at boutique volume; revisit if the shop takes off.
const MAX_PAGES = 10;

export async function fetchSalesByListing(opts: {
  accessToken: string;
  shopId: number;
}): Promise<Map<string, number>> {
  const apiKey = process.env.ETSY_API_KEY;
  const sharedSecret = process.env.ETSY_SHARED_SECRET;
  if (!apiKey || !sharedSecret) throw new Error('ETSY_API_KEY / ETSY_SHARED_SECRET not set');

  const sales = new Map<string, number>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const resp = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${opts.shopId}/receipts?was_paid=true&limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          'x-api-key': `${apiKey}:${sharedSecret}`,
        },
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Etsy getShopReceipts failed: ${resp.status} — ${body.slice(0, 200)}`);
    }

    const j = (await resp.json()) as {
      count: number;
      results: Array<{ transactions?: Array<{ listing_id?: number; quantity?: number }> }>;
    };

    for (const receipt of j.results ?? []) {
      for (const tx of receipt.transactions ?? []) {
        if (tx.listing_id == null) continue;
        const key = String(tx.listing_id);
        sales.set(key, (sales.get(key) ?? 0) + (tx.quantity ?? 1));
      }
    }

    if (offset + (j.results?.length ?? 0) >= j.count || (j.results?.length ?? 0) === 0) break;
  }

  return sales;
}
