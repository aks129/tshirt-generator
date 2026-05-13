# Plan 3 — Competitive Pricing — Design Spec

**Date:** 2026-05-13
**Status:** Approved, ready for implementation planning
**Owner:** Eugene Vestel
**Builds on:** Plan 1 (foundation + bulk generator) + Plan 2 (Printify + Etsy publishing). First listing live at Etsy listing ID 4504330542 / Printify product 6a04642ad54e5aa2fa00cdeb.

## 1. Purpose & Goals

Set initial listing prices using competitive market intelligence instead of a hardcoded $24.99. For each design about to be published, surface a recommended price derived from Etsy's public search results, with operator override before publish.

**Week-1 success criterion:** Every new listing publishes at a price within ±$2 of the median of similar live Etsy listings, OR explicitly at the floor when competitive data is unavailable. Operator confirms each price before publish — no automated re-pricing of live listings.

**Explicit non-goals for Plan 3:**
- Auto-updating prices on already-live listings (deferred)
- Tracking own-shop sales velocity (Phase A from brainstorming, deferred)
- Trend detection / "what to make next" (Phase D, deferred)
- Per-niche pricing strategies (one global rule for v1)
- Multi-source pricing (Etsy only; no eRank/EverBee/Marmalead API integration)

## 2. Hard realities acknowledged in the design

- **Etsy has no official sales-data API for other shops.** This system uses only publicly listed prices on search results pages.
- **Scraping Etsy is gray-area.** Etsy's robots.txt permits `/search`; we behave as a low-volume well-behaved client (5s rate limit, real User-Agent, 24h cache). The system degrades gracefully when blocked.
- **Plan 3 is "Phase B" only.** A real PriceLabs-equivalent needs own-shop sales data (Phase A, deferred) and trend detection (Phase D, deferred). Plan 3 alone optimizes for "look reasonable next to competition at listing time."

## 3. Prerequisites (already in place)

- Plan 2 done: publish modal, `/api/listings` POST accepts publish payload
- `lib/printify/create-product.ts` already accepts optional `priceCents`
- Vercel + Neon + Gemini all wired

No new env vars, no new third-party accounts.

## 4. Architecture

```
Publish modal opens for a design
   ↓
   ├─→ POST /api/designs/[id]/draft-listing          (existing, Plan 2)
   └─→ POST /api/designs/[id]/price-recommendation   (NEW)
         ↓
         1. Load design, build search query from
            concept.niche_keywords + " t shirt"
         2. Compute query_hash = sha256(normalized tokens)
         3. SELECT etsy_price_samples WHERE query_hash AND fetched_at > NOW() - 24h
            → cache hit returns immediately, source='cached'
            → cache miss falls through to scrape
         4. Scrape Etsy /search → cheerio parse (primary) or JSON-LD regex (fallback)
         5. Filter prices ($5–$120 sanity band, drop sale strikethroughs)
         6. Compute statistics: count, min, p25, median, p75, max
         7. Upsert into etsy_price_samples
         8. Recommendation = max(median − settings.price_offset_cents,
                                settings.min_price_floor_cents)
         9. Return { recommendedCents, statistics, source, fetchedAt }
   ↓
Modal shows price field pre-filled with recommendation, caption shows
sample count + range, ↻ button re-runs scrape (bypasses cache)
   ↓
Operator confirms (or overrides) → Publish to Etsy →
POST /api/listings body now includes priceCents → runPublish →
createProduct(priceCents) → Printify variants get the chosen price
```

## 5. Data Model

**Migration `0002_pricing.sql`:**

```sql
ALTER TABLE settings
  ADD COLUMN price_offset_cents INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN min_price_floor_cents INTEGER NOT NULL DEFAULT 1499;

CREATE TABLE etsy_price_samples (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query        TEXT NOT NULL,
  query_hash   TEXT NOT NULL UNIQUE,
  sample_count INTEGER NOT NULL,
  min_cents    INTEGER NOT NULL,
  p25_cents    INTEGER NOT NULL,
  median_cents INTEGER NOT NULL,
  p75_cents    INTEGER NOT NULL,
  max_cents    INTEGER NOT NULL,
  raw_prices   JSONB NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'ok'
);

CREATE INDEX idx_etsy_price_samples_query_hash ON etsy_price_samples(query_hash);
CREATE INDEX idx_etsy_price_samples_fetched_at ON etsy_price_samples(fetched_at DESC);
```

**Field rationale:**

- `query_hash` = sha256 of normalized tokens (lowercased, sorted, deduped, stop-word-filtered). Same hash for "coffee funny tee" and "funny coffee tee".
- `raw_prices` jsonb stores the filtered price array (in cents). Enables future histogram UI without re-scraping.
- `status` enum-as-text: `ok | captcha | empty | error`. Determines whether the row is served fresh, served stale with banner, or skipped entirely.
- `price_offset_cents` on settings (default 100¢ = $1) — the "median minus X" subtractor.
- `min_price_floor_cents` (default 1499¢ = $14.99) — hard recommendation floor regardless of scraped data. Prevents single-cheap-result degenerate queries.

**No new fields on listings.** Source of truth for actual sale price is Printify (their variant rows). `listings.printifyProductId` already gives us the linkage.

## 6. Scraper Details

### Query construction (`lib/etsy/build-query.ts`)

```
Given a Concept { headline, niche_keywords }:

If niche_keywords.length >= 3:
  Take first 3 keywords, lowercase, dedupe, append "t shirt"
Else:
  Tokenize headline by whitespace, lowercase
  Filter: drop stopwords (the, a, my, your, i, it, is, ...),
          require length >= 3, drop punctuation
  Take first 3 distinct words, append "t shirt"

Result: normalized space-joined string, max 6 tokens, deterministic for hashing.
```

### Fetch (`lib/etsy/search-scraper.ts`)

```
URL:     https://www.etsy.com/search?q=<encoded query>&category=clothing&ref=auto-1
Method:  GET
Headers:
  User-Agent: random pick from 5 modern desktop UAs (Chrome 131 / Firefox 132 / Safari 18)
  Accept-Language: en-US,en;q=0.9
  Accept: text/html,application/xhtml+xml,...;q=0.9
  Cache-Control: no-cache
Timeout: 8 seconds (AbortController)

Rate-limit (server-wide):
  Single shared promise chain. Each request awaits previous + 5s sleep.
  Implementation: a module-level `let lastRequestAt: number = 0`
                  with mutex via `let queue: Promise<void> = Promise.resolve()`.
```

### Parser

```
Primary (cheerio):
  Look for elements with .currency-value or [data-search-results] price markers
  Capture text content, parse as float, multiply by 100, round to cents

Fallback (JSON-LD regex):
  Regex over raw HTML: /"price"\s*:\s*"([\d.]+)"/g
  Etsy embeds Product schema in <script type="application/ld+json"> for SEO.
  Very stable across DOM redesigns.

Both parsers run; merge unique prices.

Filter:
  Drop prices < 500 cents ($5) — likely stickers/digital goods
  Drop prices > 12000 cents ($120) — likely outliers / multi-item bundles
  Cap at 30 prices total (first page is enough for median signal)

If filtered.length === 0: status = 'empty'
If response status was 403/429 OR HTML contains 'captcha' OR 'unusual traffic': status = 'captcha'
```

### Statistics (`lib/etsy/stats.ts`)

```
Sort prices ascending.
min     = prices[0]
max     = prices[last]
median  = prices[floor(n/2)]   (lower median for even n; close enough for our purpose)
p25     = prices[floor(n * 0.25)]
p75     = prices[floor(n * 0.75)]
```

### Recommendation math

```
If sample_count >= 5 AND status === 'ok':
  recommended = max(median - settings.price_offset_cents,
                    settings.min_price_floor_cents)
  source = 'fresh' | 'cached'  (depending on whether we hit the cache)

Else if a previous-good row exists (status = 'ok', any age):
  Use its median, apply current settings offset + floor.
  source = 'stale'

Else (no good row ever recorded):
  recommended = settings.min_price_floor_cents
  source = 'unavailable'
  sample_count = 0
```

### Failure modes

| Condition | Status | Source | Effect on publish |
|---|---|---|---|
| 200 + ≥5 parsed prices | `ok` | `fresh` or `cached` | normal |
| 200 + <5 prices | `empty` | `unavailable` (or `stale` if older row) | floor used; modal shows banner |
| 403/429/CAPTCHA HTML | `captcha` | `stale` if any prior row, else `unavailable` | floor used; modal shows banner |
| Network/timeout | `error` | `stale` if any prior row, else `unavailable` | floor used; modal shows banner |

Failure NEVER blocks publish. Publish always proceeds at the floor when competitive data is missing.

## 7. UI Surface

### `app/(app)/batches/[id]/publish-modal.tsx` — modified

New **Price** field section in the editing state, between description and the Style/Cancel/Publish row:

```
Price                Suggested: $19.99  [↻ Refresh]
$ [19.99    ]
Based on 27 t-shirts · median $20.99 · range $14.99–$34.99
```

- Number input prefilled with `recommendedCents / 100`, dollars with 2 decimals
- Caption shows `sampleCount`, `medianCents`, `minCents`, `maxCents` formatted as dollars
- ↻ button POSTs to `/api/designs/[id]/price-recommendation?force=true` to bypass cache
- When `source === 'stale'` or `'unavailable'`: amber caption "⚠ Competitive data unavailable — using floor / stale sample"
- Publish button disabled if entered price below `settings.min_price_floor_cents / 100`. Server-side Zod also enforces (422 if violated).
- Recommendation is fetched in parallel with the AI draft request (both fire on modal open), no blocking serial wait.

### `app/(app)/settings/settings-form.tsx` — modified

Two new fields in the existing Caps section:

```
Price offset (cents off median)  [100]   // = $1
Minimum price floor (cents)      [1499]  // = $14.99
```

Saved via the existing `PUT /api/settings` endpoint (already extends the body schema to include these new fields).

### No new pages, no new nav links.

## 8. Endpoint Spec

### `POST /api/designs/[id]/price-recommendation`

```
Auth: session cookie (middleware)
Query params: ?force=true  → bypass cache
Body: none

Load design:
  if not found → 404
  if concept missing → 422 "Design has no concept data"

Build query, compute hash.

If !force, check cache:
  SELECT etsy_price_samples WHERE query_hash = ?
  if row exists AND fetched_at > NOW() - 24h AND status = 'ok':
    return cached, source='cached'

Otherwise scrape:
  Call lib/etsy/search-scraper.scrape(query) → { prices, status }
  Compute statistics from prices (if any).
  Upsert etsy_price_samples ON CONFLICT (query_hash) DO UPDATE.

Apply recommendation math (see Section 6).

Response 200:
{
  ok: true,
  query: "coffee funny t shirt",
  source: 'fresh' | 'cached' | 'stale' | 'unavailable',
  sampleCount: number,
  recommendedCents: number,
  statistics: {
    minCents, p25Cents, medianCents, p75Cents, maxCents
  } | null,    // null when source='unavailable' (no good row ever)
  fetchedAt: ISO string | null
}
```

### `POST /api/listings` — modified

Body schema extended:

```ts
const bodySchema = listingCopySchema.extend({
  design_id: z.string().uuid(),
  override_safety: z.boolean().optional(),
  price_cents: z.number().int().min(1).optional(),
});
```

Validation:
- If `price_cents` provided AND < settings.min_price_floor_cents → 422 "Price below floor"
- If `price_cents` not provided → use settings.min_price_floor_cents

In the publish flow, `runPublish({ ..., priceCents })` passes through to `createProduct` (already supports `priceCents` from Plan 2 fix).

### `PUT /api/settings` — modified

Zod body schema extended:

```ts
priceOffsetCents: z.number().int().min(0),
minPriceFloorCents: z.number().int().min(500),  // never below $5
```

## 9. Library Surface

```
lib/etsy/
├── build-query.ts        # buildQuery(concept) → string
├── search-scraper.ts     # scrape(query) → { prices, status, rawHtml? }
├── parse-prices.ts       # parsePrices(html) → number[]  (cents)
├── stats.ts              # computeStats(prices) → { min, p25, median, p75, max, count }
└── price-recommendation.ts  # recommend({ slogan, niche_keywords, settings, force }) → result

lib/db/
├── schema.ts             # MODIFY: add etsy_price_samples + 2 settings columns
└── migrations/
    └── 0002_pricing.sql  # generated by drizzle-kit
```

**Module responsibilities (unit-testable in isolation):**
- `build-query.ts` — pure: Concept → normalized query string. No I/O.
- `parse-prices.ts` — pure: HTML string → number[]. Two parsing strategies merged. No I/O.
- `stats.ts` — pure: number[] → statistics. No I/O.
- `search-scraper.ts` — does the fetch + rate-limiting + UA rotation. Uses parse-prices for parsing.
- `price-recommendation.ts` — orchestrates: build query → check cache → scrape if miss → apply rule. Talks to db + scraper.

## 10. Safety & Caching

- **Hard floor.** `min_price_floor_cents` enforced both client-side (button disabled) and server-side (422). Server is source of truth.
- **Rate limit.** 5-second minimum between Etsy fetches at the server, enforced via in-process promise chain. 24h cache TTL means real usage is ~5–10 fetches/day.
- **Concurrent serialization.** Two simultaneous publish modals share the rate-limited queue.
- **Graceful degradation.** Scraper failure NEVER blocks publish. Falls back to floor + UI banner.
- **No PII, no auth, no shop OAuth.** Pure public-search read.
- **No new external service dependencies.** Just outbound HTTPS to etsy.com.

## 11. Testing Strategy

### Unit tests (Vitest, mocked)

- `build-query.ts`: niche_keywords path, slogan-fallback path, stopword filter, dedup, token sort
- `parse-prices.ts`: cheerio parser on a captured `tests/fixtures/etsy-search-coffee.html` fixture, JSON-LD parser on the same, merge logic, $5/$120 filter, sale strikethrough handling
- `stats.ts`: min/p25/median/p75/max for arrays of length 1, 5, 30, 100; even and odd counts
- `price-recommendation.ts`: cache hit, cache stale (returns stale source), recommendation math (median − offset, floor clamp), all-failure-modes return matrix

### Integration tests

- Cache upsert via `ON CONFLICT (query_hash) DO UPDATE`
- API route end-to-end with mocked scraper

### No live Etsy tests in CI.

Live scrape is exercised manually as part of the smoke-test task. CI must never hit etsy.com (don't waste their rate limit budget; don't make CI flaky).

### No E2E browser tests.

Single-user-app rationale, same as Plan 1 and Plan 2.

## 12. Configuration & Environment

No new env vars. All tunables live in `settings`:

- `price_offset_cents` (default 100)
- `min_price_floor_cents` (default 1499)

Both editable from `/settings`. Per-niche overrides are out of scope.

## 13. Success Criteria (Plan 3)

- Every newly published listing's price is either (a) within $2 of the live Etsy median for its niche keywords, or (b) explicitly at the floor with a "data unavailable" banner shown at publish time
- Scraper failures degrade gracefully — publish never blocks
- Operator can override the suggested price at publish time
- Cache hit ratio on second-time-same-niche publishes is 100% (within 24h window)

## 14. Open Questions / Decisions Deferred

1. **Per-niche pricing.** v1 uses one global offset + floor. If niches diverge wildly (e.g., wedding gift tees price higher than pun tees), revisit with a per-niche-overrides table.
2. **Visualizing the price distribution.** `raw_prices` jsonb is stored; histogram UI is a cheap follow-up if/when useful.
3. **Re-pricing live listings on a schedule.** Belongs to "Phase C" from the brainstorm, deferred.
4. **Switching to a paid third-party data source.** If scraping breaks repeatedly, eRank/EverBee API integration is the next step; cost ~$5–30/mo.
