# Plan 2 — Printify + Etsy Publishing — Design Spec

**Date:** 2026-05-12
**Status:** Approved, ready for implementation planning
**Owner:** Eugene Vestel
**Builds on:** Plan 1 (foundation + bulk typography generator), live at `https://tshirt-generator-one.vercel.app`

## 1. Purpose & Goals

Turn approved designs in the review queue into live Etsy listings via Printify. This is the publish half of the end-to-end pipeline — Plan 1 produced the print-ready PNG and persisted it to Vercel Blob with a review-queue UI; Plan 2 takes that PNG and creates an Etsy-sellable Printify product.

**Week-1 success criterion:** ~20 designs are live as Etsy listings on the operator's connected shop with no manual workarounds outside the app.

**In scope for Plan 2:**
- AI-drafted Etsy listing copy (title, 13 tags, description) with editable user-confirmation modal
- Printify product creation (blueprint + provider + variant matrix from `/settings`)
- Printify → Etsy publish (uses the operator's existing Printify ↔ Etsy OAuth)
- Listings page with status, retry, and external links
- Settings page (first-run gate for Printify config)
- Daily publish cap + kill switch
- Vercel Cron daily reconciliation for stuck publishes

**Out of scope (deferred to v3+):**
- Edit live listings (use Printify dashboard)
- Per-design variant overrides (settings-wide only)
- Bulk price changes / SEO re-optimization of live listings
- Etsy market intelligence / competitor analytics
- Sales/performance overlay (v3 — Plan 2 logs the data to make this cheap later)
- Email/Slack notifications

## 2. Prerequisites (already in place)

- Plan 1 complete: scaffold, auth, DB, bulk generator, review queue
- Active Etsy shop linked to Printify (no Etsy app/API needed; we go through Printify)
- Vercel project with Neon Postgres, Vercel Blob
- Gemini API key (free tier, used for listing copy)
- Printify API token + shop ID (new requirement — added to env)

## 3. Architecture

**No Vercel Workflow DevKit this time.** Each publish is a few short API calls and a poll, well within the Vercel Functions 300s default timeout. Workflow's local-world setup caused real dev/prod inconsistency in Plan 1; skipping it for Plan 2 is a deliberate simplification.

```
Review queue → click "Approve"
   ↓
[1] POST /api/designs/[id]/draft-listing  (Gemini Flash)
   → returns { title, tags[13], description } as JSON draft
   ↓
Modal opens with editable form (~1s spinner while Gemini runs)
   ↓
User edits → clicks "Publish to Etsy"
   ↓
[2] POST /api/listings  (body: design_id + edited copy)
   → validate Etsy field rules
   → check daily publish cap + kill switch + Printify configured
   → insert listings row (status='publishing')
   → Printify: upload image (PNG URL → image_id)
   → Printify: create product (blueprint+provider+variants from settings)
   → Printify: publish to Etsy
   → poll Printify product up to 30s for external_handle (Etsy listing_id)
   → return 200 {status:'live', etsy_listing_id} OR 202 {status:'publishing_slow'}
   ↓
Modal polls GET /api/listings/[id] every 5s for ~60s if publishing_slow
   ↓
Daily cron /api/cron/reconcile (6am UTC) → reconciles any stuck listings
```

**Stack additions:**
- Vercel Cron (configured in `vercel.json`)
- No new package dependencies (Printify uses plain `fetch`; copy generation uses existing `lib/ai/gemini.ts`)

## 4. UI Surface

### `/batches/[id]` — modified

The Approve button changes from a one-click DB flip to **"Draft listing →"**, which opens the publish modal.

**Modal — draft state:**
```
┌─ Draft Etsy listing ──────────────────────────────────┐
│ [design thumbnail]   Slogan: "Coffee You Later!"      │
│ ───────────────────────────────────────────────────── │
│ Title    [text input, 140-char counter, AI-prefilled] │
│ Tags     [13 chips, comma-add, AI-prefilled]          │
│ Desc.    [textarea, AI-prefilled]                     │
│ ───────────────────────────────────────────────────── │
│ Style:  unisex tee · white/black/heather grey · S-2XL │
│         (from /settings — change there)               │
│ ───────────────────────────────────────────────────── │
│ [Cancel]                       [Publish to Etsy →]    │
└───────────────────────────────────────────────────────┘
```

**Modal — publishing state:**
```
┌─ Publishing… ─────────────────────────────────────────┐
│ ⏳ Creating Printify product…                          │
│ ⏳ Publishing to Etsy…                                 │
│ ✓  Listed! [Open on Etsy ↗]                           │
└───────────────────────────────────────────────────────┘
```

**Bulk path:** Header button **"Approve all and draft"** opens the modal sequentially for every pending-review design. Each "Publish to Etsy →" closes the current modal and opens the next. Keyboard: Enter to publish, Esc to skip. Designed for blasting through 20 listings in a sitting.

**Field validation in modal:**
- Title: live char counter (red >140, yellow >120)
- Tags: 13 chips required; banned chars stripped on input; duplicate detection
- Description: min 20 chars
- Publish button disabled until all fields valid

### `/listings` — new

Plain table page. Columns: thumbnail · slogan · title (truncated) · status badge · Etsy link · Printify link · published_at.

- Filter chips: `live` / `publishing` / `failed` / `all`
- Sort: newest first (no other sort options in v2)
- Row click → drawer with full listing data + retry button if failed
- Foundation for v3 "what sold" analytics overlay

### `/settings` — new

Single-page form, sections:

1. **Printify**
   - Blueprint dropdown (default highlighted: Bella+Canvas 3001)
   - Print provider dropdown (populated from Printify catalog API, cached)
   - Variant matrix: checkbox grid of colors × sizes (default checked: white/black/heather grey × S/M/L/XL/2XL)
   - "Save Printify config" button — also sets `settings.printify_setup_at = NOW()`

2. **Caps**
   - Daily generation cap (carries over from Plan 1 — still in `settings`)
   - Daily publish cap (default 15)
   - Daily budget cap (cents)

3. **Kill switch**
   - Toggle: "Pause all publishing"
   - Confirmation dialog before turning ON

**First-run banner on `/` dashboard:**
If `settings.printify_setup_at IS NULL` → orange banner: "⚠ Set up Printify before publishing — [Open settings]"

### Dashboard — minor changes

- New stat card: "Live listings (7d)"
- New mini-list: "Publish queue" (anything in `publishing` / `publishing_slow`) below recent batches

## 5. Data Model

**Migration `0001_publishing.sql`:**

```sql
ALTER TABLE settings
  ADD COLUMN printify_setup_at TIMESTAMPTZ;

ALTER TABLE listings
  ADD COLUMN edited_by_user BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE printify_catalog_cache (
  id          INT PRIMARY KEY DEFAULT 1,
  blueprints  JSONB NOT NULL,
  providers   JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Existing tables — usage clarifications

**`listings`** (already exists from Plan 1; no schema change beyond `edited_by_user`):
- `design_id` (fk unique) — refuses duplicate publishing for same design
- `title`, `description`, `tags[]` — saved at publish time, edited copy
- `printify_product_id` — populated after Printify product create
- `etsy_listing_id` — populated when Printify reports `external_handle`
- `status` enum: `publishing | publishing_slow | live | failed`
- `published_at` — set when status flips to `live`
- `failure_reason` — Printify error truncated to 500 chars
- `safety_blocked` — set if content safety post-edit check flags it

**`settings`** (already exists; new fields tracked):
- `default_printify_blueprint_id INT`
- `default_print_provider_id INT`
- `default_variants JSONB` — `{ colors: ['white','black','heather_gray'], sizes: ['s','m','l','xl','2xl'] }`
- `etsy_shop_id TEXT` — also used by the Plan-1 review queue
- `daily_publish_cap INT DEFAULT 15`
- `kill_switch_active BOOLEAN`
- `printify_setup_at TIMESTAMPTZ` — new, gates the first-run banner

**`designs`** — no schema change. `status` enum already covers `approved | publishing | live | failed`.

**`generation_events`** — append-only audit log already exists. Plan 2 writes new event types: `listing_drafted`, `published`, `publish_failed`, `safety_blocked_at_publish`. Seeds the v3 "what sold" analytics by storing enough lineage now.

### `printify_catalog_cache`

Single-row cache (id=1). Refreshed if `fetched_at > NOW() - INTERVAL '24 hours'`. Holds the full Printify blueprints + print providers list so `/settings` doesn't hit Printify's API on every page load (Printify rate-limits at ~5 req/s/shop).

## 6. Publish Pipeline

### Endpoint: `POST /api/designs/[id]/draft-listing`

Fast Gemini Flash call. Triggers when the modal opens.

```
Input:  design_id (from route param)
Auth:   session cookie (existing middleware)
Loads:  design row → concept.headline (the slogan), style
        settings row → niche context, etsy_shop_id (for region hints)

Prompt: Gemini Flash, system instructs Etsy SEO best practices:
        - Title ≤140 chars, front-loaded with high-intent keywords
        - Mix of literal slogan keywords + intent words ("funny", "gift", "tee")
        - 13 tags: each ≤20 chars, mix of short (1-2 word)
          and long-tail (3-5 word phrases)
        - Description: 2-3 paragraphs, mentions material
          (Bella+Canvas 3001 cotton blend), print method (DTG), sizing
          (unisex, runs true to size)

Output validated against `listingCopySchema`:
        { title, tags: string[13], description }

Cache:  result stored in `generation_events.payload` with type='listing_drafted'
        Re-opening the modal for the same design returns the cached value
        (modal still allows regeneration via a "↻ Re-draft" button — calls
        the endpoint with ?force=true to bypass cache)

On Gemini failure (timeout, 429, schema mismatch after 2 retries):
        Return a fallback draft built locally:
          title = `${slogan} Funny T-Shirt`
          tags = words from slogan + ['funny', 'tee', 'gift', 'shirt']
                 padded to 13, deduped, truncated to ≤20 chars each
          description = "${slogan} — a comfortable unisex tee printed on
                         Bella+Canvas 3001. Made just for you. Available in
                         multiple colors and sizes."
        The modal never blocks on AI failure.
```

Latency target: <2s typical, fallback path <50ms.

### Endpoint: `POST /api/listings` — the publish

```
Input body (Zod-validated):
  { design_id, title, tags: string[13], description }

Steps (all blocking, sequential):

1. Server-side re-validation of all Etsy field rules
   (NEVER trust client-side validation)
2. Daily publish cap check → 429 if over
3. Kill switch check → 503 if active
4. settings.printify_setup_at NOT NULL → 400 if missing
5. Idempotency: refuse if listings row already exists for this design_id
   with status in (publishing, publishing_slow, live)

6. Content-safety pass on final edited copy (existing checkSafety):
   if any flags → set listings.safety_blocked = true, return 422 with reasons
   Modal shows "Content blocked: <reasons> — [Override and publish anyway]"
   Override = one-time per design, logged in generation_events with
   event_type='safety_blocked_at_publish' and payload.overridden=true

7. Insert listings row:
   status='publishing'
   edited_by_user = (any field differs from cached AI draft)
   title, description, tags, design_id

8. Printify image upload:
   POST /v1/shops/{shop_id}/uploads/images.json
   { url: <design.imageBlobUrl> }   (Vercel Blob URLs are public — simplest)
   → image_id

9. Printify product create:
   POST /v1/shops/{shop_id}/products.json
   { blueprint_id, print_provider_id, variants: [...],
     print_areas: [{ position: 'front', images: [{ id: image_id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }],
     title, description, tags }
   → printify_product_id (saved to listings row)

10. Printify publish trigger:
    POST /v1/shops/{shop_id}/products/{id}/publish.json
    { title:true, description:true, images:true, variants:true, tags:true }
    → Printify queues the Etsy publish; returns 202

11. Poll Printify product for external_handle (Etsy listing_id):
    Loop GET /v1/shops/{shop_id}/products/{id}.json every 3s, up to 30s total
    On external_handle present:
      update listings: status='live', etsy_listing_id, published_at=NOW()
      log generation_events type='published'
      return 200 { status: 'live', etsy_listing_id, etsy_url }
    On 30s timeout:
      update listings: status='publishing_slow'
      return 202 { status: 'publishing_slow', listing_id }

Per-step error handling:
- Printify 4xx (steps 8/9/10): fail-fast.
  listings.status='failed', failure_reason = response text (truncated 500 chars)
  log generation_events type='publish_failed'
  return 502 { error, step }
- Printify 5xx: retry once with 2s backoff. After retry: same as 4xx.
- Network error: same as 5xx.
- Step 11 poll: timeout is NORMAL, not an error. publishing_slow is fine.
```

### Endpoint: `GET /api/listings/[id]`

Two purposes: modal poll while in `publishing_slow`, and the listings page row drawer.

```
1. Load listings row
2. If status == 'publishing' or 'publishing_slow':
     Poll Printify product once for external_handle.
     If now populated: update listings → status='live', etsy_listing_id
     If still not: return current row (no DB write)
3. Return row JSON (including failure_reason if status='failed')
```

### Endpoint: `GET /api/cron/reconcile`

Vercel Cron. Configured in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/reconcile", "schedule": "0 6 * * *" }]
}
```

Auth: Vercel automatically adds `Authorization: Bearer ${CRON_SECRET}`. Reject 401 if header missing or mismatched.

```
SELECT listings WHERE status IN ('publishing', 'publishing_slow')
                  AND created_at < NOW() - INTERVAL '1 hour'

For each:
- Query Printify GET /products/{id}
- If external_handle present: mark live, set etsy_listing_id
- If listing is > 24h old AND still no external_handle:
  mark failed, failure_reason = 'Printify publish timeout (24h)'

Logs run summary to generation_events with type='reconcile_run'
```

### Endpoint: `POST /api/listings/[id]/retry`

Called from the `/listings` page retry button on a failed row.

```
Reads listings row. Resumes at the first incomplete step:
- No printify_product_id → restart at image upload
- printify_product_id present, no etsy_listing_id → restart at publish step
- etsy_listing_id present → no-op (already live; refresh)

Re-runs the publish workflow from that step. No double-charging because
Printify dedupes by product/image hash.
```

### Endpoint: `GET /api/printify/catalog`

Server-side catalog fetcher for `/settings`. Returns cached blueprints + providers from `printify_catalog_cache`, refreshing from Printify if cache is stale (>24h).

```
1. SELECT * FROM printify_catalog_cache WHERE id = 1
2. If row missing OR fetched_at > 24h ago:
     Fetch Printify GET /v1/catalog/blueprints.json → list of all blueprints
     For default blueprint (B+C 3001): also fetch /v1/catalog/blueprints/3001/print_providers.json
     Upsert printify_catalog_cache (id=1, blueprints, providers, fetched_at)
3. Return { blueprints, providers }
```

### Printify rate limits

Printify enforces ~5 req/sec/shop. Worst case per publish: 3 calls (upload, create, publish) + up to 10 polls = 13 calls over 30s. Well under. Daily cap of 15 publishes = ~195 calls/day. No throttle needed in v2.

## 7. Listing Copy Generation

### Gemini prompt for `draft-listing`

System prompt template (Gemini Flash via `lib/ai/gemini.ts geminiJSON`):

```
You write Etsy-optimized listing copy for print-on-demand t-shirts.

CONSTRAINTS:
- title: ≤140 chars, MUST start with the slogan or its rephrase, then
  high-intent keywords (Funny T-Shirt, Gift, etc.). Front-load value words.
- tags: EXACTLY 13. Each ≤20 chars. Mix:
  - 4-5 short (1-2 word) high-volume tags
  - 6-7 medium (2-3 word) niche tags
  - 1-2 long-tail (3-5 word) phrases
  - All lowercase, letters/numbers/spaces only — NO punctuation, emojis, symbols
- description: 2-3 paragraphs.
  - Para 1: hook the slogan, call out who it's for
  - Para 2: material (100% combed ring-spun cotton Bella+Canvas 3001) + print
    method (DTG, water-based ink, fade-resistant) + fit (unisex, runs true)
  - Para 3: care + sizing chart pointer + gift-worthiness

Return JSON ONLY in this exact format:
{ "title": "...", "tags": ["...", ...13 total], "description": "..." }

NO trademarks, NO celebrity names, NO copyrighted phrases.
```

User prompt:
```
Slogan: <design.concept.headline>
Style: typography t-shirt
Niche keywords (optional): <empty for bulk-generator designs>
```

### Validators (Zod, server-side)

```ts
const TAG_PATTERN = /^[a-z0-9 ]+$/;
const titleBanned = /[<>{}\[\]|™®©]/;

const listingCopySchema = z.object({
  title: z.string().min(5).max(140).refine((s) => !titleBanned.test(s)),
  tags: z.array(z.string().min(1).max(20).regex(TAG_PATTERN)).length(13),
  description: z.string().min(20).max(13000),
});
```

Used in both:
- After Gemini returns (server) — retry once if schema fails
- On `/api/listings` POST (server) — final check before publish

## 8. Safety, Errors, Observability

### Safety guardrails

- **Daily publish cap** (default 15) — enforced in `/api/listings` step 2
- **Kill switch** — checked in both `/api/listings` and `/api/cron/reconcile`
- **Etsy field validator** — runs server-side at publish, never trust client
- **Content-safety filter** — runs on final edited copy, sets `safety_blocked` flag, one-time per-design override allowed (logged)
- **Idempotency** — refuses re-publish for designs already with publishing/live listing rows
- **Cron secret** — `CRON_SECRET` env var rejects spoofed cron calls

### Error handling philosophy

- Per-step failures write `failure_reason` (truncated 500 chars of the upstream error) on the listings row
- UI surfaces the exact reason in `/listings` row drawer — no opaque "something went wrong"
- Retry button in failed-row drawer resumes from first incomplete step
- Cron acts as the safety net for Printify publishes that take >30s but <24h
- After 24h with no Etsy listing ID, cron marks failed with timeout reason

### Observability

- **Vercel Function logs** — primary debug surface (proven critical in Plan 1 prod crash)
- **`generation_events` table** — every Printify call writes a row with type, design_id, duration, response status. Drives the v3 analytics overlay later
- **Dashboard "Publish queue" mini-list** — surfaces stuck listings without needing to open /listings
- No third-party APM (Sentry/Datadog) in Plan 2

## 9. Testing Strategy

Pragmatic, focused on the parts that are dangerous to get wrong.

### Unit tests (Vitest, mocked)

- Zod validators: title length, banned chars, tag count, tag regex, description length
- Cap-checking: publish cap, kill switch, settings not-yet-configured
- Listing copy fallback (when Gemini errors, fallback returns valid draft)
- Idempotency check: refuses duplicate publish for design with active listing
- Content safety post-edit: integrates existing `checkSafety` correctly

### Integration tests (recorded fixtures via `nock` or fetch mocks)

- Full publish happy path: image upload → create → publish → poll → live
- Printify 4xx response → fail-fast, no retry, listings.status='failed'
- Printify 5xx → retry once, then fail
- Etsy publish slow (no external_handle in 30s) → returns `publishing_slow`
- Cron reconcile: stuck-1h listing gets reconciled when Printify catches up

### Live-API tests

- Not run in CI
- Manual test mode: `PRINTIFY_TEST_MODE=true` env var creates Printify products with `visible: false` (draft, not published to Etsy). Exercises the full Printify API without polluting the Etsy shop.
- First production smoke test: real shop, 1 listing, manual sanity check on the listing page

### No E2E browser tests in Plan 2

- Single-user app, manual UI exploration is enough

## 10. Configuration & Environment

### New env vars

```
# Printify API access (https://printify.com/app/account/api)
PRINTIFY_API_TOKEN=...
PRINTIFY_SHOP_ID=...

# Cron auth (Vercel adds this header on its cron calls automatically)
CRON_SECRET=$(openssl rand -hex 32)

# Optional: test mode for draft Printify products
PRINTIFY_TEST_MODE=false
```

All four set in Vercel project env for production. `PRINTIFY_TEST_MODE` only used in development.

### Settings defaults (seeded by Plan 1, used by Plan 2)

- `daily_publish_cap = 15`
- `kill_switch_active = false`
- `default_printify_blueprint_id = NULL` (until user completes `/settings`)
- `default_print_provider_id = NULL`
- `default_variants = NULL`
- `printify_setup_at = NULL` — gates the first-run banner

## 11. Success Criteria (Plan 2)

- **End of week 1:** ~20 designs are live as Etsy listings via the app, no manual workarounds
- **No shop suspension or Etsy warning** during the first 20 listings
- **All failures surface to UI** with actionable reasons — no debugging by log-scraping
- **Reconciliation works:** at least one publish goes through the `publishing_slow → cron → live` path successfully (validates the safety net)
- **v3 analytics seed:** every listing has full lineage in `generation_events` for the future sales overlay

## 12. Open Questions / Decisions Deferred to Implementation

These are intentionally not pre-decided in the spec — they'll be made during planning or first implementation:

1. **Exact Printify blueprint and print provider IDs** — set during first `/settings` run via the catalog API; user-driven, not pre-chosen
2. **Variant matrix default set** — currently described as "white/black/heather grey × S/M/L/XL/2XL" but actual variant IDs depend on the provider chosen; settled at first `/settings` save
3. **Modal layout micro-details** — char counter colors, tag chip styling, etc. — settled during implementation against the existing shadcn UI
4. **Whether `/settings` Printify section needs OAuth or just an API token** — API token is the v2 path (simpler, no OAuth complexity); if Printify ever changes that, revisit
5. **Cron schedule precision** — currently 6am UTC daily; can be tuned to operator's timezone in `/settings` later if needed
