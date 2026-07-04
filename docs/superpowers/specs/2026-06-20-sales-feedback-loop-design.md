# Design: Sales-feedback loop (v1 — listing stats + insights)

**Date:** 2026-06-20
**Status:** Approved (user: "go ahead" on the recommended feature)

## Goal

Close the loop: the app publishes listings but never learns which ones work.
V1 collects daily per-listing performance (views, favorites) from Etsy and
surfaces a "What's selling" ranking on the dashboard, so the operator doubles
down on winners and stops making losers. This is the highest-ROI missing
feature identified in the 2026-06-20 product review.

## Constraints discovered

- The Etsy OAuth grant is `listings_w` only — **no transactions scope**, so
  order/revenue data is unavailable without re-consent. Deferred to v2.
- `views` and `num_favorers` ARE available on the **public** `getListing`
  endpoint using just the API key (`x-api-key: keystring:shared_secret`) —
  verified live earlier this session. So v1 needs no OAuth change at all.
- Etsy rate limits are generous for this volume (~30 live listings → ~30
  GETs/day), but the collector paces requests anyway.

## Non-goals (YAGNI, v1)

- No order/revenue tracking (needs `transactions_r` re-consent — v2).
- No auto-repricing or auto-archiving (surface insight first; act later).
- No "draft more like this" button (cheap later; not core to the loop).
- No charts — a ranked list beats a chart at n≈30 listings.

## Design

### 1. Schema — `listing_stats` daily snapshots

```ts
export const listingStats = pgTable('listing_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  etsyListingId: text('etsy_listing_id').notNull(), // denormalized for resilience
  views: integer('views').notNull().default(0),
  favorers: integer('favorers').notNull().default(0),
  state: text('state').notNull().default('active'), // etsy listing state
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Append-only snapshots; deltas computed at read time. One row per live listing
per day (~30/day — years before size matters).

### 2. Collector — `lib/etsy/listing-stats.ts`

`fetchEtsyListingStats(etsyListingId)` → `{ views, favorers, state }` via
public `GET /v3/application/listings/{id}` with the `keystring:shared_secret`
x-api-key header (same auth as `upload-to-etsy.ts`). Non-OK → throw typed
error; 404 → `{ state: 'removed' }` so the caller can record disappearance.

### 3. Cron route — `POST/GET /api/cron/stats`

Bearer `CRON_SECRET` (same guard as reconcile). For each `listings` row with
`status='live'` and an `etsyListingId`: fetch stats, insert a snapshot row,
pace ~250ms between calls. Continues past per-listing failures. Returns
`{ ok, captured, failed }`. `runtime='nodejs'`, `maxDuration=300`.

### 4. Scheduling — extend `.github/workflows/reconcile.yml`

Add a second step after reconcile hitting `/api/cron/stats` with the same
secrets. One daily workflow does heal-then-measure.

### 5. Insights — dashboard "What's selling" card

Server component on the dashboard: for live listings, latest snapshot joined
with the oldest snapshot within the last 7 days → `Δviews`, `Δfavorers`.
Rank by `Δviews` desc (fall back to total views while history is <2 days).
Show top 5: title (linked to Etsy), views (+Δ), favorites (+Δ). Uses existing
Print Shop card styles + `anim-rise`.

## Error handling

- Collector failures per listing are counted and logged (`logEvent` type
  `'generated'`, kind `stats_run`) — never abort the run.
- Etsy 404 (delisted/removed) records a snapshot with `state='removed'`;
  reconcile's external-deletion pass remains the authority for flipping rows.
- Dashboard renders nothing (no card) when there are no snapshots yet.

## Testing

- Unit: `fetchEtsyListingStats` (auth header, field mapping, 404 → removed).
- Unit: rank/delta helper (pure): given snapshots, compute Δ + ordering, and
  the <2-snapshots fallback.
- Route wiring follows the reconcile route's tested patterns (no route test —
  consistent with existing route conventions).

## Success criteria

- Daily snapshots accumulate for every live listing with zero operator action.
- Dashboard shows a ranked "What's selling" list with 7-day deltas.
- A failing Etsy call for one listing never blocks the rest.
