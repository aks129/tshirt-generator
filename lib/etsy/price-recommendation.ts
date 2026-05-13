import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { etsyPriceSamples, type Settings } from '@/lib/db/schema';
import { buildQuery, queryHash, type ConceptLike } from './build-query';
import { scrapeEtsySearch, type ScrapeResult } from './search-scraper';
import { erankSearch } from './erank-client';
import { etsyOpenApiSearch } from './open-api-client';
import { computeStats, type PriceStats } from './stats';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_SAMPLE_COUNT = 5;

function fetchCompetitiveData(query: string): Promise<ScrapeResult> {
  // Preferred: Etsy's own Open API (official, free, no scraping).
  if (process.env.USE_ETSY_OPEN_API === 'true' && process.env.ETSY_API_KEY) {
    return etsyOpenApiSearch(query);
  }
  // Backup: eRank API (currently no API — scaffold kept for future / pivot).
  if (process.env.USE_ERANK === 'true' && process.env.ERANK_API_KEY) {
    return erankSearch(query);
  }
  // Fallback: public-search scraper. Returns 'captcha' from Vercel IPs;
  // graceful degradation handles that downstream.
  return scrapeEtsySearch(query);
}

export type RecommendationSource = 'fresh' | 'cached' | 'stale' | 'unavailable';

export type RecommendationResult = {
  query: string;
  source: RecommendationSource;
  sampleCount: number;
  recommendedCents: number;
  statistics: PriceStats | null;
  fetchedAt: Date | null;
};

type SettingsLike = Pick<Settings, 'priceOffsetCents' | 'minPriceFloorCents'>;

function applyRule(median: number, settings: SettingsLike): number {
  return Math.max(median - settings.priceOffsetCents, settings.minPriceFloorCents);
}

export async function recommendPrice(opts: {
  concept: ConceptLike;
  settings: SettingsLike;
  force?: boolean;
}): Promise<RecommendationResult> {
  const query = buildQuery(opts.concept);
  const hash = queryHash(query);

  const existing = await db.query.etsyPriceSamples.findFirst({
    where: eq(etsyPriceSamples.queryHash, hash),
  });

  // Fresh cache hit
  if (!opts.force && existing && existing.status === 'ok'
      && existing.fetchedAt.getTime() > Date.now() - CACHE_TTL_MS) {
    return {
      query,
      source: 'cached',
      sampleCount: existing.sampleCount,
      recommendedCents: applyRule(existing.medianCents, opts.settings),
      statistics: {
        count: existing.sampleCount,
        min: existing.minCents,
        p25: existing.p25Cents,
        median: existing.medianCents,
        p75: existing.p75Cents,
        max: existing.maxCents,
      },
      fetchedAt: existing.fetchedAt,
    };
  }

  // Scrape
  const scrape = await fetchCompetitiveData(query);
  const stats = scrape.prices.length >= MIN_SAMPLE_COUNT
    ? computeStats(scrape.prices)
    : null;

  if (scrape.status === 'ok' && stats) {
    await db.insert(etsyPriceSamples).values({
      query,
      queryHash: hash,
      sampleCount: stats.count,
      minCents: stats.min,
      p25Cents: stats.p25,
      medianCents: stats.median,
      p75Cents: stats.p75,
      maxCents: stats.max,
      rawPrices: scrape.prices,
      status: 'ok',
    }).onConflictDoUpdate({
      target: etsyPriceSamples.queryHash,
      set: {
        sampleCount: stats.count,
        minCents: stats.min,
        p25Cents: stats.p25,
        medianCents: stats.median,
        p75Cents: stats.p75,
        maxCents: stats.max,
        rawPrices: scrape.prices,
        fetchedAt: new Date(),
        status: 'ok',
      },
    });
    return {
      query,
      source: 'fresh',
      sampleCount: stats.count,
      recommendedCents: applyRule(stats.median, opts.settings),
      statistics: stats,
      fetchedAt: new Date(),
    };
  }

  // Scrape failed or had too few prices.
  // If we have ANY prior good row, serve it as stale.
  if (existing && existing.status === 'ok' && existing.sampleCount >= MIN_SAMPLE_COUNT) {
    return {
      query,
      source: 'stale',
      sampleCount: existing.sampleCount,
      recommendedCents: applyRule(existing.medianCents, opts.settings),
      statistics: {
        count: existing.sampleCount,
        min: existing.minCents,
        p25: existing.p25Cents,
        median: existing.medianCents,
        p75: existing.p75Cents,
        max: existing.maxCents,
      },
      fetchedAt: existing.fetchedAt,
    };
  }

  // No prior good data. Fall back to floor.
  return {
    query,
    source: 'unavailable',
    sampleCount: 0,
    recommendedCents: opts.settings.minPriceFloorCents,
    statistics: null,
    fetchedAt: null,
  };
}
