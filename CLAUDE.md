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

## Business goal & flow

The app turns a list of slogans into Etsy listings, end-to-end:

1. **Bulk generator** (`/batches/new`) — operator pastes slogans, picks font/size/color/template/optional stock image, renders to print-ready 3000×3600 transparent PNGs in the browser via Canvas API, uploads each to Vercel Blob.
2. **Review queue** (`/batches/[id]`) — approve / reject individual designs.
3. **Publish** (modal on approval) — Gemini drafts Etsy listing copy, competitive-pricing rec runs in parallel, operator hits "Publish to Etsy".
4. **Server publish path** (`POST /api/listings`) clones the operator's **master Printify product** (blueprint, provider, all colors/sizes, per-variant prices, print-area placement) and posts a new product with the design swapped in. Printify auto-publishes the front mockup to Etsy.
5. **Photo top-up** — `POST /api/listings/[id]/photos` fetches the remaining 9 Printify-rendered mockups and uploads them directly to Etsy via the seller's OAuth token, bypassing Printify's "only 1 mockup auto-publishes" limit.
6. **Daily cron** (`/api/cron/reconcile`, `0 6 * * *`) flips slow publishes to `live`, backfills missing photos, and detects externally-deleted Printify products.

## Master Printify product = single source of truth

`settings.masterPrintifyProductId` is the **only** input that controls what shirt is sold. Blueprint, providers, variant list, per-variant pricing, mockup library — all inherited from this product on every publish (`lib/printify/master-product.ts:fetchMasterProduct` → `lib/printify/create-product.ts:createProductFromMaster`).

Do **not** reintroduce `settings.defaultPrintifyBlueprintId / defaultPrintProviderId / defaultVariants` into the publish path. The columns still exist in the DB for backward compat but nothing reads them. The publish modal has no price input — master's per-variant prices win.

`createProductFromMaster` filters out placeholders the master defined but never put an image on (e.g. blueprint exposes back/sleeve/neck print areas but the operator only placed art on the front). Printify 400s with `images field is required` if you send empty `images: []`. Keep that filter.

To change product config (colors, sizes, pricing, mockups): edit the master product in the Printify dashboard, then in `/settings` re-pick it (or just save — same product id) to refresh.

## Architecture map

```text
app/(app)/           Authenticated UI pages (cookie-gated by middleware.ts)
  page.tsx           Dashboard — stats, AI health card, recent batches, banners
  batches/new/       Bulk generator (Canvas-based)
  batches/[id]/      Review grid + publish modal
  listings/          Live/pending listings table, sync, AI mockup gallery
  settings/          Master Printify picker, caps, Etsy OAuth, shirt templates

app/api/             Route handlers (all runtime='nodejs')
  listings/          POST publish, GET/DELETE one, retry, sync, photos,
                     custom-mockups, upload-saved-mockups
  printify/          catalog (cached blueprints/providers), my-products (master picker)
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
  canvas/            render.ts — print-ready PNG renderer (browser Canvas).
                     fonts.ts — 28 curated Google Fonts.
  db/                Drizzle schema + migrations. Single-row settings table.
  etsy/              OAuth client (PKCE), validators, listing-copy schemas,
                     scraper + Open API client for competitive pricing.
  mockups/           process-listing.ts orchestrates Printify→Etsy photo
                     upload; printify-mockups.ts fetches Printify's rendered
                     mockup library; custom-mockup.ts is the Recraft+sharp
                     bespoke-mockup pipeline (manual trigger from /listings).
  printify/          Thin REST wrappers. master-product.ts is the canonical
                     publish input; create-product.ts only knows how to clone.
  publish/           publish-design.ts — top-level orchestrator
                     (upload image → clone master → publish → poll).
  themes/            Curated slogan packs for the bulk generator.
  insights/          Pattern matchers + tips shown in the bulk generator and
                     publish modal.

docs/superpowers/    Implementation plans + specs (4 plans shipped: Foundation,
                     Publishing, Competitive Pricing, Mockup Photos).
```

## Database

**Drizzle ORM + Neon Postgres** (`lib/db/client.ts`). Schema in `lib/db/schema.ts`; migrations in `lib/db/migrations/`. **One row per table is intentional** for several config tables (`settings.id=1`, `printifyCatalogCache.id=1`).

Workflow:

1. Edit `lib/db/schema.ts`
2. `pnpm db:generate` (drizzle-kit produces `000N_*.sql`)
3. For features drizzle-kit can't express (partial indexes, custom CHECKs), append the SQL manually to the generated file
4. `pnpm db:migrate`

`DATABASE_URL` in `.env.local` is the **production** Neon URL. There is no separate dev DB. Non-destructive ALTERs are safe; coordinate with the user before destructive changes.

## Auth

`middleware.ts` cookie-gates everything except `PUBLIC_PATHS`. Env vars: `APP_PASSWORD` (single shared password, `teeshirts` in dev), `AUTH_COOKIE_SECRET` (jose signing, ≥32 chars). For curl testing: `POST /api/auth/login` with `{"password":"..."}` → use `-c/-b` cookie jar.

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
