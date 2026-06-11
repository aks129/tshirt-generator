// eRank API client — alternative competitive data source.
//
// Scaffolded but NOT yet wired with the real endpoint. Once we have an eRank
// Expert API key + the verified endpoint shape, the FILL_IN_AFTER_SIGNUP
// markers below get replaced. The function preserves the same ScrapeResult
// shape as lib/etsy/search-scraper.ts so price-recommendation.ts can swap
// between them via the USE_ERANK env flag with zero call-site changes.

import type { ScrapeResult } from './search-scraper';

// FILL_IN_AFTER_SIGNUP: verify base URL when the eRank Expert API docs are
// in hand. As of last public reference, eRank's API was hosted at:
const ERANK_BASE = 'https://api.erank.com/v1';

// FILL_IN_AFTER_SIGNUP: verify exact endpoint name. Most likely candidates:
//   /listings/search?q=...&country=US
//   /search/listings?query=...&marketplace=etsy
//   /etsy/search?keyword=...
// The endpoint must return an array (or object containing an array) of live
// Etsy listings with current prices. If eRank only exposes keyword metrics
// (search volume, competition) and NOT actual listing-level prices, this
// integration cannot work and we'd need to switch to Sale Samurai/EverBee.
const SEARCH_ENDPOINT = '/listings/search'; // PLACEHOLDER

const TIMEOUT_MS = 10_000;

type ErankListing = {
  // FILL_IN_AFTER_SIGNUP: replace with the actual field name eRank returns.
  // Common shapes: { price: "21.99", price_cents: 2199, current_price: 21.99 }
  price?: string | number;
  price_cents?: number;
};

type ErankSearchResponse = {
  // FILL_IN_AFTER_SIGNUP: replace with the actual response wrapper.
  // Likely one of: { results: [] } | { listings: [] } | { data: [] }
  results?: ErankListing[];
  listings?: ErankListing[];
  data?: ErankListing[];
};

function priceToCents(p: ErankListing): number | null {
  if (typeof p.price_cents === 'number' && Number.isFinite(p.price_cents)) {
    return Math.round(p.price_cents);
  }
  if (typeof p.price === 'number' && Number.isFinite(p.price)) {
    return Math.round(p.price * 100);
  }
  if (typeof p.price === 'string') {
    const n = parseFloat(p.price);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

const MIN_CENTS = 500;   // $5
const MAX_CENTS = 12000; // $120

export async function erankSearch(query: string): Promise<ScrapeResult> {
  const apiKey = process.env.ERANK_API_KEY;
  if (!apiKey) {
    return { prices: [], status: 'error' };
  }

  const url = `${ERANK_BASE}${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&country=US&limit=30`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    const json = (await resp.json()) as ErankSearchResponse;
    const listings = json.results ?? json.listings ?? json.data ?? [];
    const prices = listings
      .map(priceToCents)
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
