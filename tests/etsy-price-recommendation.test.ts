import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/etsy/search-scraper', () => ({
  scrapeEtsySearch: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { etsyPriceSamples: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

import { scrapeEtsySearch } from '@/lib/etsy/search-scraper';
import { db } from '@/lib/db/client';
import { recommendPrice } from '@/lib/etsy/price-recommendation';

const baseSettings = {
  priceOffsetCents: 100,
  minPriceFloorCents: 1499,
};

const baseConcept = {
  headline: 'Coffee You Later',
  niche_keywords: ['coffee', 'funny tee', 'sarcasm'],
};

function chainInsertMock() {
  vi.mocked(db.insert).mockReturnValue({
    values: () => ({
      onConflictDoUpdate: () => Promise.resolve(),
    }),
  } as never);
}

beforeEach(() => {
  chainInsertMock();
});

describe('recommendPrice', () => {
  it('returns cached row when fresh (<24h)', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue({
      id: 'x', query: 'coffee funny tee t shirt', queryHash: 'h',
      sampleCount: 12, minCents: 1500, p25Cents: 1800, medianCents: 2200, p75Cents: 2600, maxCents: 3000,
      rawPrices: [], fetchedAt: new Date(), status: 'ok',
    } as never);

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    expect(r.source).toBe('cached');
    expect(r.recommendedCents).toBe(2100); // 2200 − 100 offset
    expect(scrapeEtsySearch).not.toHaveBeenCalled();
  });

  it('scrapes when cache stale (>24h)', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue({
      id: 'x', query: 'q', queryHash: 'h', sampleCount: 0,
      minCents: 0, p25Cents: 0, medianCents: 0, p75Cents: 0, maxCents: 0,
      rawPrices: [], fetchedAt: new Date(Date.now() - 25 * 3600 * 1000), status: 'ok',
    } as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({
      prices: [1500, 1800, 2000, 2200, 2500, 2800],
      status: 'ok',
    });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    expect(r.source).toBe('fresh');
    expect(r.statistics?.median).toBe(2200);
    expect(r.recommendedCents).toBe(2100);
  });

  it('clamps recommendation at floor', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue(null as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({
      prices: [1200, 1400, 1500, 1600, 1800],
      status: 'ok',
    });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    // median = 1500, minus offset 100 = 1400, clamped at 1499
    expect(r.recommendedCents).toBe(1499);
  });

  it('returns stale when current scrape is captcha and old row exists', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue({
      id: 'x', query: 'q', queryHash: 'h', sampleCount: 10,
      minCents: 1500, p25Cents: 1800, medianCents: 2100, p75Cents: 2400, maxCents: 2800,
      rawPrices: [], fetchedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000), status: 'ok',
    } as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({ prices: [], status: 'captcha' });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    expect(r.source).toBe('stale');
    expect(r.recommendedCents).toBe(2000); // 2100 − 100
  });

  it('returns unavailable + floor when no prior row and scrape fails', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue(null as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({ prices: [], status: 'error' });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    expect(r.source).toBe('unavailable');
    expect(r.recommendedCents).toBe(1499);
    expect(r.statistics).toBeNull();
    expect(r.sampleCount).toBe(0);
  });

  it('force=true bypasses cache and re-scrapes', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue({
      id: 'x', query: 'q', queryHash: 'h', sampleCount: 10,
      minCents: 1500, p25Cents: 1800, medianCents: 2200, p75Cents: 2400, maxCents: 2800,
      rawPrices: [], fetchedAt: new Date(), status: 'ok',
    } as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({
      prices: [1800, 2000, 2200, 2400, 2600], status: 'ok',
    });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings, force: true });
    expect(scrapeEtsySearch).toHaveBeenCalled();
    expect(r.source).toBe('fresh');
  });

  it('returns empty + stale when scrape has <5 prices but prior row exists', async () => {
    vi.mocked(db.query.etsyPriceSamples.findFirst).mockResolvedValue({
      id: 'x', query: 'q', queryHash: 'h', sampleCount: 10,
      minCents: 1500, p25Cents: 1800, medianCents: 2100, p75Cents: 2400, maxCents: 2800,
      rawPrices: [], fetchedAt: new Date(Date.now() - 25 * 3600 * 1000), status: 'ok',
    } as never);
    vi.mocked(scrapeEtsySearch).mockResolvedValueOnce({
      prices: [2000, 2100], status: 'ok',  // only 2 prices — below 5 threshold
    });

    const r = await recommendPrice({ concept: baseConcept, settings: baseSettings });
    expect(r.source).toBe('stale');
    expect(r.recommendedCents).toBe(2000); // stale median 2100 - 100
  });
});
