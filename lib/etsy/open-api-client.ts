// Etsy Open API v3 client — official competitive data source.
//
// Etsy's public listing search lives at:
//   GET /v3/application/listings/active
// Auth: x-api-key header with the app's keystring (issued after app approval).
// No OAuth needed for public listing search — that's the whole reason this
// path is viable for our use case.
//
// Spec: https://developers.etsy.com/documentation/reference/#operation/findAllListingsActive
//
// Caveats verified during scaffolding:
// - Free tier rate limit: 10 req/sec, 10k req/day. Plenty for our scale.
// - taxonomy_id 162 = "Clothing" — narrows search to apparel.
// - keywords are space-separated; max ~256 chars.
// - Response: { count, results: [{ price: { amount, divisor, currency_code }, ... }] }.

import type { ScrapeResult } from './search-scraper';

const ETSY_BASE = 'https://openapi.etsy.com/v3/application';
const ENDPOINT = '/listings/active';

const TAXONOMY_CLOTHING = 162;
const LIMIT = 30;
const TIMEOUT_MS = 10_000;

const MIN_CENTS = 500;
const MAX_CENTS = 12000;

type EtsyPrice = {
  amount: number;
  divisor: number;
  currency_code: string;
};

type EtsyListing = {
  listing_id: number;
  title: string;
  price: EtsyPrice;
  currency_code: string;
};

type EtsySearchResponse = {
  count: number;
  results: EtsyListing[];
};

function listingPriceCents(l: EtsyListing): number | null {
  const p = l.price;
  if (!p || p.currency_code !== 'USD') return null; // skip non-USD for v1
  if (typeof p.amount !== 'number' || typeof p.divisor !== 'number' || p.divisor <= 0) return null;
  // Etsy's amount/divisor: e.g., {amount: 1999, divisor: 100} = $19.99.
  // Convert to cents: amount * 100 / divisor.
  return Math.round((p.amount * 100) / p.divisor);
}

export async function etsyOpenApiSearch(query: string): Promise<ScrapeResult> {
  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) {
    return { prices: [], status: 'error' };
  }

  const url =
    `${ETSY_BASE}${ENDPOINT}` +
    `?keywords=${encodeURIComponent(query)}` +
    `&taxonomy_id=${TAXONOMY_CLOTHING}` +
    `&limit=${LIMIT}` +
    `&sort_on=score` +
    `&sort_order=desc`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      signal: ac.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      return { prices: [], status: 'captcha' };
    }
    if (resp.status === 429) {
      return { prices: [], status: 'captcha' };
    }
    if (!resp.ok) {
      return { prices: [], status: 'error' };
    }

    const json = (await resp.json()) as EtsySearchResponse;
    const prices = (json.results ?? [])
      .map(listingPriceCents)
      .filter((p): p is number => p !== null && p >= MIN_CENTS && p <= MAX_CENTS)
      .slice(0, 30);

    if (prices.length === 0) return { prices: [], status: 'empty' };
    return { prices, status: 'ok' };
  } catch {
    return { prices: [], status: 'error' };
  } finally {
    clearTimeout(t);
  }
}
