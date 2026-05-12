# T-Shirt Generator MVP — Design Spec

**Date:** 2026-05-12
**Status:** Approved, ready for implementation planning
**Owner:** Eugene Vestel

## 1. Purpose & Goals

A single-user web app that automates the t-shirt POD workflow: AI-generated designs → Printify product → Etsy listing. The week-1 goal is **20 approved designs live on Etsy** to test-drive which niches/styles get traction. The longer-term profit goal ($1,000 in sales) is a downstream outcome that depends on what listings the data shows are working; this app is the *vehicle* for running that experiment, not a guarantee of revenue.

**In scope for v1:** end-to-end pipeline from prompt → live Etsy listing.

**Explicitly out of scope (deferred to v2+):**
- Etsy market intelligence / competitor scraping / "what's selling" analytics
- In-app design editing
- Bulk editing of live listings (use Printify dashboard)
- Automated SEO re-optimization of live listings
- Multi-user, teams, billing
- Direct Etsy Open API integration (we publish via Printify's existing Etsy link)
- Order/sales analytics overlay (v1 logs enough data for v2 to add this)

## 2. Prerequisites (confirmed)

- Active Etsy shop capable of accepting orders
- Printify account
- Printify ↔ Etsy already linked in Printify dashboard
- Anthropic API key (Claude)
- Image generation API key (Recraft V3 — direct API or via Replicate)
- Vercel account (for hosting + Neon + Blob + Workflow)

## 3. Architecture

**Stack:**
- Next.js 16 (App Router) on Vercel
- Neon Postgres (via Vercel Marketplace) with Drizzle ORM
- Vercel Blob for generated PNGs
- Vercel Workflow (WDK) for durable async generation and publish pipelines
- shadcn/ui + Tailwind CSS
- Single-user, password-gated (no multi-user auth)

**Why Vercel Workflow:** generation batches involve multiple long-running external API calls (Claude, Recraft, Printify) and must survive function timeouts and transient failures. Workflow gives us durable steps, automatic retries, and pause/resume — exactly the right tool for the job.

**End-to-end flow:**

```
[1] User starts a generation Batch (picks niche from library OR free-form prompt,
    picks styles, picks count)
[2] Server expands brief into N design concepts (Claude)
[3] Server fans out generation (concurrency 5):
      - typography → Claude SVG → rasterize to 4500x5400 PNG
      - illustration/vintage → Recraft V3 → 4500x5400 transparent PNG
[4] PNG uploaded to Blob; Design row created (status=pending_review)
[5] User opens Review Queue → approves/rejects each design
[6] On approve: Claude writes Etsy-optimized title+tags+description
[7] Printify API: create product (B+C 3001, configured colors/sizes), attach design
[8] Printify API: publish to Etsy via existing OAuth link
[9] Listing row updated with Printify product ID + Etsy listing ID
```

## 4. UI Surface

Five screens. Single-user, password-gated.

### `/login`
Single password field, signed cookie on success. That's the whole auth story.

### `/` Dashboard
- "Start a new batch" primary CTA
- Recent batches list (status: generating / ready / completed / failed)
- Counters: designs generated this week, designs approved, designs published, listings currently live
- Today's spend (cents), today's design count vs. cap
- Recent activity feed (from `generation_events`)

### `/batches/new` (Generate)
- Free-form prompt textarea
- Sidebar: curated niche library (clickable chips that prepend a prompt template)
- Style toggles: Typography, Illustration, Vintage (any combination, default all three)
- Count slider (1–20 per batch in v1)
- "Generate" button → kicks off Workflow, redirects to batch detail

### `/batches/[id]` (Review queue)
- Grid of generated designs; each card shows on-shirt mockup preview, headline/concept, style, generation prompt
- Per-card actions: Approve, Reject, Regenerate
- Bulk-select + bulk-approve
- Live per-design status: generating · pending_review · approved · publishing · live · failed
- Failure reasons surfaced inline

### `/listings`
- Table of published listings: thumbnail, Etsy listing ID (external link), Printify product ID, created date, niche/style tags, status
- Filter by status, niche, style
- Foundation for v2 analytics overlay (no analytics shown in v1)

### `/settings`
- Daily generation cap (default 50)
- Daily publish cap (default 15)
- Daily spend cap in cents (default 500 = $5)
- Default Printify blueprint + print provider + variant matrix
- Etsy shop ID
- Kill-switch toggle ("pause all generation and publishing")

## 5. Data Model

Six tables. Drizzle ORM, schema-first migrations.

### `batches`
- `id` (uuid pk), `created_at`
- `prompt` (text)
- `niche_tag` (text, nullable — links to `niche_library.slug` when applicable)
- `styles` (text[] — subset of `typography`, `illustration`, `vintage`)
- `requested_count` (int)
- `status` (enum: `generating` | `ready` | `completed` | `failed`)
- `workflow_run_id` (text)

### `designs`
- `id` (uuid pk), `batch_id` (fk), `created_at`
- `style` (enum: `typography` | `illustration` | `vintage`)
- `concept` (jsonb: `{headline, illustration_prompt, palette, mood, niche_keywords[]}`)
- `image_blob_url` (text — 4500×5400 PNG, transparent background)
- `mockup_blob_url` (text — on-shirt preview composite, review-only)
- `status` (enum: `generating` | `pending_review` | `approved` | `rejected` | `publishing` | `live` | `failed`)
- `model_used` (text: `claude-svg` | `recraft-v3`)
- `generation_cost_cents` (int)
- `failure_reason` (text, nullable)

### `listings` (1:1 with approved designs that have started publishing)
- `id` (uuid pk), `design_id` (fk unique), `created_at`
- `title` (text — ≤140 chars)
- `description` (text)
- `tags` (text[] — exactly 13, each ≤20 chars, Etsy constraints)
- `printify_product_id` (text)
- `etsy_listing_id` (text, nullable until published)
- `status` (enum: `publishing` | `publishing_slow` | `live` | `failed`)
- `published_at` (timestamp, nullable)
- `failure_reason` (text, nullable)

### `niche_library` (seed data, editable)
- `id`, `slug`, `label`, `prompt_template` (text), `default_styles` (text[]), `is_active` (bool)

### `settings` (single-row k/v)
- `daily_generation_cap` (int, default 50)
- `daily_publish_cap` (int, default 15)
- `daily_budget_cents` (int, default 500)
- `default_printify_blueprint_id` (int — B+C 3001)
- `default_print_provider_id` (int)
- `default_variants` (jsonb: colors/sizes)
- `etsy_shop_id` (text)
- `kill_switch_active` (bool, default false)

### `generation_events` (append-only audit log)
- `id`, `design_id` (fk, nullable for batch-level events), `batch_id` (fk, nullable)
- `event_type` (text: `generated` | `approved` | `rejected` | `regenerated` | `published` | `publish_failed` | `sale_recorded`)
- `payload` (jsonb)
- `created_at`

The events table is the seed for v2 analytics — by logging everything now, we get the historical data for free when we eventually add a sales/performance overlay.

## 6. Generation Pipeline

Vercel Workflow: `generateBatch(batch_id)`

### Step 1 — `expandBrief`
- Input: prompt, styles, count
- Calls Claude (claude-sonnet-4-6) to return N design concepts as JSON
- Each concept: `{style, headline, illustration_prompt, palette, mood, niche_keywords[]}`
- Output validated with Zod; on parse failure, retry once with the error fed back
- Inserts one `designs` row per concept (status=`generating`)
- Enforces `daily_generation_cap` and `daily_budget_cents` before proceeding — over cap → batch marked `failed` with reason

### Step 2 — `generateDesign` (fan-out, concurrency 5)
Per design:

**For `style = 'typography'`:**
- Claude generates SVG with constraints in prompt: 4500×5400 viewport, transparent background, palette, headline, mood, layout rules
- Curated list of 8–10 royalty-free Google Fonts embedded via `<defs>`
- Prompt includes 4–6 reference SVG examples as few-shot context
- Server-side rasterization via `resvg` → 4500×5400 transparent PNG

**For `style = 'illustration' | 'vintage'`:**
- Recraft V3 API with style preset (`digital_illustration` for illustration, same with style guidance for vintage) + illustration_prompt + palette
- Returns 4500×5400 transparent PNG URL → server downloads
- Fallback: if returned PNG has a background, run server-side `rembg` or Replicate background-removal call

**Common per-design tail:**
- Upload PNG to Vercel Blob → `image_blob_url`
- Generate on-shirt mockup (composite design over white Bella+Canvas tee template via `sharp`) → upload to Blob → `mockup_blob_url`
- Update `designs` row: status=`pending_review`, `model_used`, `generation_cost_cents`
- Log `generation_events` (type=`generated`)
- Idempotency key on Recraft calls: `${batch_id}:${design_id}` (prevents double-billing on workflow restart)

### Step 3 — `markBatchReady`
- Update `batches.status = 'ready'`

### Per-design failure handling
- Failure on a single design marks *that design* `failed` with `failure_reason`; the batch continues
- User sees failed designs in the review queue with the reason and a "Regenerate" button
- Regenerate = a 1-design batch using the same concept with a new RNG seed/variation hint; old design row stays `rejected`

### Known risks
1. **Claude SVG output quality.** Will likely need prompt-tuning during the first day of testing. Budget half a day for this.
2. **"Vintage" not a Recraft preset.** We combine `digital_illustration` with style guidance in the prompt; may need iteration.
3. **Background transparency.** Image-gen sometimes returns backgrounds despite the prompt. Fallback background-removal step accounts for this.

## 7. Publish Pipeline

Vercel Workflow: `publishDesign(design_id)` — triggered on approve.

### Step 1 — `writeListingCopy`
- Claude generates: title (≤140 chars), description, tags (exactly 13, ≤20 chars each)
- Prompt fed: concept, niche_keywords, headline, style, current Etsy SEO rules
- Output validated against Etsy constraints (length, tag count, no banned chars)
- Retry once on validation failure with error fed back; after 2 failures → `failed` with reason
- Creates `listings` row (status=`publishing`)

### Step 2 — `ensurePublishCapNotExceeded`
- Count `listings` published in last 24h
- Over cap → workflow pauses (sleep until next window) instead of failing
- This is what makes "drip publish" work without losing approved designs

### Step 3 — `createPrintifyProduct`
- POST `/v1/shops/{shop_id}/products.json`
- Payload: blueprint=B+C 3001, print_provider, configured variant matrix, design PNG (uploaded via `/uploads`), title, description, tags
- Response: `printify_product_id` → update `listings`
- Retry on 5xx; fail-fast on 4xx (most 4xx = bad dimensions or missing variant; surface clearly)

### Step 4 — `publishToEtsy`
- POST `/v1/shops/{shop_id}/products/{product_id}/publish.json`
- Payload: `{ title:true, description:true, images:true, variants:true, tags:true }`
- Printify queues the publish; Etsy listing ID returns asynchronously
- v1 approach: poll Printify every 30s for up to 5 min, capture `etsy_listing_id`, mark `live`
- If publish doesn't complete in 5 min → mark `publishing_slow` (not `failed`); reconciliation cron handles backfill
- Log `generation_events` (type=`published`)

### Daily reconciliation cron (3am)
- For listings in `publishing` or `publishing_slow` for >1h: query Printify for current state, update `etsy_listing_id` and status
- For listings marked `live`: optional sanity check that the Etsy listing still exists (catches takedowns)
- Cheap insurance against publish polling missing the window

### Etsy API note
We never call Etsy's API directly in v1. Printify's existing OAuth link handles all Etsy interaction. This avoids the Etsy developer app approval wait (days/weeks) and simplifies the integration surface significantly.

## 8. Safety, Errors, Observability

### Safety guardrails
- **Single-user password gate.** Cookie-based, signed with a server secret. No public endpoints.
- **Daily generation cap** (default 50) — enforced in `expandBrief`
- **Daily publish cap** (default 15) — enforced via pause-and-resume in publish workflow
- **Daily budget cap** (default $5) — image-gen step checks today's `generation_cost_cents` total and refuses if over
- **Content safety filter** — Claude pass on every generated concept *and* every approved listing's title+tags+description, flagging trademarks, slurs, copyrighted characters/phrases, sensitive imagery. Since every design already requires human review in v1, the filter adds a `safety_flags` (text[]) field to the `designs` row (e.g., `["trademark", "celebrity_name"]`) and a `safety_blocked` boolean on `listings`. Flagged designs are shown with a prominent warning in the review queue; `safety_blocked=true` listings never publish, even if approved, until the operator clears the flag.
- **Kill switch** — `/settings` toggle; both workflows check before each step

### Error handling philosophy
- Per-design failures isolate from their batch
- Per-listing failures isolate from their design (design stays `approved`; user can retry publish)
- Every failure writes `failure_reason` on the row + a `generation_events` row
- UI surfaces failures inline — no silent failures
- No retry loops beyond what each step lists (avoids burning money on flaky third-parties)

### Observability
- Vercel Workflow per-step traces = primary debug surface
- Every external call (Claude, Recraft, Printify) logs: timestamp, duration, cost, design_id, response status → `generation_events`
- Dashboard shows today's spend, today's count, success/failure ratio
- No third-party APM (Sentry/Datadog) in v1

## 9. Testing Strategy

Pragmatic, focused on the parts that are dangerous to get wrong.

### Unit tests
- Zod schemas for Claude responses (concept expansion, listing copy)
- Etsy field validators (title length, tag count, banned chars)
- Cost computation
- Cap-checking logic (daily generation, publish, budget)

### Integration tests (recorded fixtures)
- Full batch generation happy path
- Recraft 5xx retry behavior
- Printify 4xx fail-fast behavior
- Publish polling timeout → `publishing_slow` state
- Daily cap rejection

### Live-API tests
- Not run in CI
- Manual "test mode" flag uses Printify draft (unpublished) products and never calls Etsy publish
- Acceptance test for week 1 is a manual smoke test against the real shop with 1–2 listings

### No E2E browser tests in v1
- Single-user app, manual exploration is sufficient

## 10. Configuration & Defaults

Captured in `settings` table on first boot:

- `daily_generation_cap = 50`
- `daily_publish_cap = 15`
- `daily_budget_cents = 500` ($5/day hard cap)
- `default_printify_blueprint_id = ` Bella+Canvas 3001 (to be looked up at setup time)
- `default_print_provider_id = ` selected at setup time (varies by region/quality preference)
- `default_variants` — full standard color/size matrix for B+C 3001 (S/M/L/XL/2XL/3XL × 10–15 colors, configurable)
- `kill_switch_active = false`

Environment variables required:
- `DATABASE_URL` (Neon)
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
- `ANTHROPIC_API_KEY`
- `RECRAFT_API_KEY` (or `REPLICATE_API_TOKEN` if going through Replicate)
- `PRINTIFY_API_TOKEN`
- `PRINTIFY_SHOP_ID`
- `APP_PASSWORD` (single-user auth)
- `AUTH_COOKIE_SECRET` (for signing the session cookie)

## 11. Success Criteria (v1)

- **End of week 1:** ~20 approved designs are live as Etsy listings via the app, with no manual workarounds outside the app
- **No shop suspension or warning** from Etsy during week 1
- **No runaway spend** — total image-gen + Claude cost for week 1 stays under $20
- **All failures surface to UI** with actionable reasons — no debugging by log-scraping
- **v2 analytics seed:** every design has full lineage in `generation_events`, so when we later add sales overlay we don't need to backfill

## 12. Open Questions / Decisions Deferred to Implementation

These are intentionally not pre-decided in the spec — they'll be made during planning or implementation:

1. **Exact Recraft V3 endpoint path** (direct vs. Replicate proxy) — TBD during planning; depends on which you already have an API key for and pricing as of implementation date
2. **Curated niche library starter list** — populated during implementation with 15–20 entries based on widely-known POD niches; editable in DB after launch
3. **Printify blueprint and print provider IDs** — looked up during first deploy via Printify's catalog API; written to `settings`
4. **Default variant matrix (which colors, which sizes)** — finalized during implementation; conservative default = white/black/heather grey × S–2XL to start
