# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

This project runs Next.js **16.2.6** (React 19, App Router, Turbopack). APIs and conventions differ from older Next.js — read `node_modules/next/dist/docs/` before writing code that touches routing, route handlers, middleware, or server components. Heed deprecation notices in build output (e.g. `middleware` → `proxy`).

## Commands

```bash
pnpm dev               # Local dev (http://localhost:3000, expects .env.local)
pnpm build             # Production build with TypeScript check
pnpm lint              # eslint (Next config)
pnpm test              # vitest run — all tests
pnpm test:watch        # vitest watch
pnpm test tests/foo.test.ts                      # one file
pnpm test tests/foo.test.ts -t "name fragment"   # one test by name

pnpm db:generate       # drizzle-kit generate (after editing lib/db/schema.ts)
pnpm db:migrate        # apply pending migrations to DATABASE_URL
pnpm db:seed           # one-off seed (lib/db/seed.ts)

vercel --prod --yes    # production deploy (auto-aliased to tshirt-generator-one.vercel.app)
```

The Vercel CLI is the deploy path; there's no GitHub Actions CD. `vercel env add NAME production` to add prod env vars; `vercel env pull .env.local` to sync down.

PRs **do** run CI: a `security-baseline` reusable workflow (CodeQL) plus the default `Analyze (javascript-typescript)` scan. Known false positive — a React `<img src={value}>` flagged `js/xss-through-dom` ("DOM text reinterpreted as HTML"): React assigns `src` via the DOM property, not HTML parsing, so a string there can't be reinterpreted as markup. Dismiss as *false positive* in the Security UI rather than chasing a CodeQL-recognized sanitizer (a scheme allowlist won't clear it). The default CodeQL check is the authoritative one.

## Business goal & flow

The app turns slogans into Etsy listings, end-to-end. **There are two generation paths that coexist** — both selectable as tabs on `/batches/new` (`generator-tabs.tsx`: "Paste list" | "Generate with AI"). Don't conflate them:

- **Browser-Canvas bulk generator** (`bulk-generator.tsx`, the "Paste list" tab) — operator pastes slogans, picks font/size/color/template/optional stock image, renders print-ready 3000×3600 transparent PNGs in the browser via Canvas API (`lib/canvas/render.ts`), uploads each to Vercel Blob, and `POST`s to **`/api/bulk-batches`**. No AI, no server render.
- **AI server-side workflow** (`ai-generator.tsx`, the "Generate with AI" tab → `POST /api/batches`) — operator submits a `{prompt, styles[], count}` brief; the route inserts a `batches` row and kicks off the `generateBatch` Vercel Workflow (`app/workflows/generate-batch.ts`). The workflow expands the brief into concepts, generates each design server-side (typography → SVG rasterized with resvg; illustration → Recraft V3, then white-bg removal), uploads PNGs to Blob, and flips the batch to `ready`. The per-design regenerate button (`DesignCard.tsx`) also drives this workflow. See **Vercel Workflow generation** below.

Both feed the same review → publish pipeline:

1. (generation — one of the two paths above)
2. **Review queue** (`/batches/[id]`) — approve / reject / regenerate individual designs (`/api/designs/[id]/*`).
3. **Publish** (modal on approval) — Gemini drafts Etsy listing copy, competitive-pricing rec runs in parallel, operator hits "Publish to Etsy".
4. **Server publish path** (`POST /api/listings`) clones the operator's **master Printify product** (blueprint, provider, all colors/sizes, per-variant prices, print-area placement) and posts a new product with the design swapped in. Printify auto-publishes the front mockup to Etsy.
5. **Photo top-up** — `POST /api/listings/[id]/photos` fetches the remaining 9 Printify-rendered mockups and uploads them directly to Etsy via the seller's OAuth token, bypassing Printify's "only 1 mockup auto-publishes" limit.
6. **Daily cron** (`/api/cron/reconcile`, `0 6 * * *`) flips slow publishes to `live`, flips silently-failed publishes to `failed` (see **Publish reliability**), backfills missing photos, and detects externally-deleted Printify products.

## Master Printify product = single source of truth

`settings.masterPrintifyProductId` is the **only** input that controls what shirt is sold. Blueprint, providers, variant list, per-variant pricing, mockup library — all inherited from this product on every publish (`lib/printify/master-product.ts:fetchMasterProduct` → `lib/printify/create-product.ts:createProductFromMaster`).

The `settings.defaultPrintifyBlueprintId / defaultPrintProviderId / defaultVariants` columns are written again by the **optional "Default shirt template" picker** in `/settings` (restored intentionally), but they are still an *optional reference default* for the generator — the **publish path must never read them**. Master product remains the sole publish input. Don't wire the default-template fields into `runPublish` / `createProductFromMaster`.

The publish modal has an **optional manual price override** (off by default): when the operator ticks "Override with a fixed base price", the modal sends `price_cents` and `/api/listings` uses it as `basePriceCents` (clamped to `minPriceFloorCents`), winning over the dynamic competitive rec. When off, dynamic pricing applies (competitive rec → master prices). Either way the master's per-variant size-upcharge curve is preserved by `applyDynamicPricing`.

`createProductFromMaster` filters out placeholders the master defined but never put an image on (e.g. blueprint exposes back/sleeve/neck print areas but the operator only placed art on the front). Printify 400s with `images field is required` if you send empty `images: []`. Keep that filter.

To change product config (colors, sizes, pricing, mockups): edit the master product in the Printify dashboard, then in `/settings` re-pick it (or just save — same product id) to refresh.

## Publish reliability (Printify → Etsy)

Printify's managed Etsy publish can fail **silently**: `POST .../publish.json` returns 2xx but the product's `external` stays null and it unlocks without an Etsy listing ever being created — Printify only surfaces a generic error in its dashboard, nothing via the API. Hard-won facts:

- **The master must be a plain product, not a Printify Studio personalization product** (`sales_channel_properties.personalisation`, `strategy: "pstudio"`, a `personalize.at` link). Clones of a personalization master hit the generic error and never reach Etsy. Use a plain blueprint master that has been published to Etsy once manually so its Etsy config is proven valid.
- `createProductFromMaster` forwards the master's `sales_channel_properties` (Etsy shipping/category config) onto clones, **guarded** — only when present, so it's a byte-identical no-op for masters without it. If Printify ever 400s on create with an SCP error, the publish fails *loudly* (visible `failed` row), never silently.
- **No silent `publishing_slow` forever.** `getProduct` exposes `isLocked`; the pure helper `lib/publish/classify-stuck-publish.ts` maps `(isLocked, hasExternal, ageMs, cutoffMs) → 'live' | 'failed' | 'wait'`; the reconcile cron flips an **unlocked + no-`external` + aged** listing to `failed` with a human-readable reason. A still-locked product returns `'wait'` (Printify is still processing) — that lock check is the safety valve against false-positive failures.
- **429 + `Retry-After` backoff** in `printifyFetch` (`lib/printify/client.ts`) and `uploadEtsyListingImage` (`lib/mockups/upload-to-etsy.ts`): max 3 retries, honor `Retry-After` capped at 10s, exponential 1s/2s/4s fallback. Printify caps publishing at 200/30min; Etsy enforces QPS+QPD.

## Architecture map

```text
app/(app)/           Authenticated UI pages (cookie-gated by middleware.ts)
  page.tsx           Dashboard — stats, AI health card, recent batches, banners
  batches/new/       Bulk generator (Canvas-based)
  batches/[id]/      Review grid + publish modal
  listings/          Live/pending listings table, sync, AI mockup gallery
  settings/          Master Printify picker, caps, Etsy OAuth, shirt templates

app/workflows/       Vercel Workflow definitions (generate-batch.ts + steps.ts)
app/.well-known/workflow/  Auto-generated workflow runtime endpoints (do not hand-edit)

app/api/             Route handlers (all runtime='nodejs')
  batches/           POST starts the AI generateBatch workflow; [id] reads status
  bulk-batches/      Browser-Canvas path: upload-token + batch row creation
  designs/[id]/      Per-design actions: approve, reject, regenerate,
                     draft-listing, price-recommendation, preflight, custom-mockups
  listings/          POST publish, GET/DELETE one, retry, sync, photos,
                     custom-mockups, upload-saved-mockups
  printify/          catalog (cached blueprints/providers), my-products (master picker)
  shirt-templates/   Designer backdrops; import-printify pulls real shirt photos
  etsy/oauth/        PKCE OAuth flow (start, callback, disconnect)
  cron/reconcile/    Daily reconciliation pass
  insights/ai        24h provider/latency stats
  health/ai          Live ping Gemini + Groq

lib/
  ai/                gemini.ts (with Groq fallback), groq.ts, listing-copy.ts,
                     content-safety.ts, log.ts (events). geminiJSON returns
                     { raw, parsed, provider } — Groq fires automatically on
                     transient Gemini failures (429/5xx/network).
  auth/              jose-signed cookie sessions (`tshirt_session`)
  caps/              enforcement.ts — daily/batch generation cap checks
                     (canStartBatch), gates both generation paths.
  canvas/            render.ts — print-ready PNG renderer (browser Canvas).
                     fonts.ts — 28 curated Google Fonts. zip.ts — client ZIP export.
  recraft/           client.ts — Recraft V3 image-generation wrapper.
  images/            Server-side raster pipeline: rasterize.ts (SVG→PNG via
                     resvg), bg-remove.ts (white-bg detection/removal), mockup.ts.
  blob/              upload.ts — Vercel Blob upload helper (server side).
  preflight/         checks.ts — pre-publish QA checklist for a design.
  schemas.ts         Shared zod schemas (DesignStyle, Concept, safety) for the
                     AI workflow.
  db/                Drizzle schema + migrations. Single-row settings table.
  etsy/              OAuth client (PKCE), validators, listing-copy schemas,
                     scraper + Open API client for competitive pricing.
  mockups/           process-listing.ts orchestrates Printify→Etsy photo
                     upload; printify-mockups.ts fetches Printify's rendered
                     mockup library; custom-mockup.ts is the Recraft+sharp
                     bespoke-mockup pipeline (manual trigger from /listings).
                     custom-mockup.ts picks light/dark scenes via
                     `selectScenes` driven by `printify/variant-colors.ts`
                     (`fetchConfiguredTones` reads the master's variant colors)
                     so dark-shirt sellers get dark-shirt mockups.
  printify/          Thin REST wrappers. master-product.ts is the canonical
                     publish input; create-product.ts only knows how to clone.
  publish/           publish-design.ts — top-level orchestrator
                     (upload image → clone master → publish → poll).
  themes/            Curated slogan packs for the bulk generator.
  insights/          Pattern matchers + tips shown in the bulk generator and
                     publish modal.

docs/superpowers/    Implementation plans + specs (Foundation, Publishing,
                     Competitive Pricing, Mockup Photos, Publish Reliability, …).
```

## Vercel Workflow generation

AI batch generation runs as a **durable Vercel Workflow** (`workflow` package, the WDK). `POST /api/batches` calls `start(generateBatch, [batchId])` from `workflow/api`; the `batches.workflowRunId` column tracks the run.

- `app/workflows/generate-batch.ts` is the orchestrator — marked with the `'use workflow'` directive. It must stay deterministic: all I/O (DB, Recraft, Blob, AI) lives in **steps** (`app/workflows/steps.ts`), each a `'use step'` function. Don't inline side effects into the orchestrator.
- `app/.well-known/workflow/` (config.json, manifest.json, flow/step/webhook routes) is **generated by the build** — never hand-edit; regenerate by building.
- Steps are individually retried/resumed, so they must be idempotent. The pipeline: `expandBriefStep` (Gemini → concepts) → `insertDesignRowsStep` → `generateOneDesignStep` per design (typography→SVG/resvg, illustration→Recraft V3+bg-remove, then Blob upload) → `markBatchReadyStep`. Caps are checked up front via `checkCapsStep`; failures route to `markBatchFailedStep`.

## Database

**Drizzle ORM + Neon Postgres** (`lib/db/client.ts`). Schema in `lib/db/schema.ts`; migrations in `lib/db/migrations/`. **One row per table is intentional** for several config tables (`settings.id=1`, `printifyCatalogCache.id=1`).

Workflow:

1. Edit `lib/db/schema.ts`
2. `pnpm db:generate` (drizzle-kit produces `000N_*.sql`)
3. For features drizzle-kit can't express (partial indexes, custom CHECKs), append the SQL manually to the generated file
4. `pnpm db:migrate`

`DATABASE_URL` in `.env.local` is the **production** Neon URL. There is no separate dev DB. Non-destructive ALTERs are safe; coordinate with the user before destructive changes.

## Auth

`middleware.ts` cookie-gates everything except `PUBLIC_PATHS`. Env vars: `APP_PASSWORD` (single shared password, `tshirts` in dev), `AUTH_COOKIE_SECRET` (jose signing, ≥32 chars). For curl testing: `POST /api/auth/login` with `{"password":"..."}` → use `-c/-b` cookie jar.

## AI providers

Gemini is primary (`gemini-2.5-flash`, free tier). Groq (`llama-3.3-70b-versatile`, free tier) is the silent fallback — `geminiJSON` retries through Groq automatically on 429 / 5xx / network errors. Both keys live in Vercel env. The `DraftResult.source` field surfaces which provider answered ('gemini' | 'groq' | 'fallback').

Image generation uses **Recraft V3** (paid, `RECRAFT_API_KEY`) for both stock illustrations and bespoke base scenes. Gemini's image model (Nano Banana) has zero free tier — don't try to use it.

## Vercel function constraints

- `maxDuration` defaults to 60s. Publish flow takes ~15-25s typical; we use a 5s poll budget so slow publishes flip to `publishing_slow` and get caught by the client poll loop in `publish-modal.tsx` (12 × 5s) + the daily cron.
- Heavier routes bump to 90s: `/api/listings/[id]/photos`, `/api/listings/[id]/custom-mockups`.

## Conventions seen across the codebase

- All API route files set `export const runtime = 'nodejs'` — never use Edge runtime; sharp/pg/jose require Node.
- All persistence rolls through Drizzle; no raw SQL except inside migration files.
- TypeScript path alias `@/*` → repo root. Use it consistently.
- Tests mock at module boundary (`vi.mock('@/lib/...')`) — adding new internal calls within a mocked module doesn't break tests.
- Plans + specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/`. New cross-cutting features go through the brainstorming → spec → plan flow before code.
