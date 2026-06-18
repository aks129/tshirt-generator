# DagsThreads Studio

Turn slogans into print-ready t-shirt designs and publish them to Etsy as fully-configured Printify products — colors, sizes, per-variant pricing, mockups, and best-practice listing copy — end to end.

It's a single-operator web app: paste or AI-generate a batch of slogans, review the rendered designs, and publish the approved ones. Each publish clones a **master Printify product** (your one source of truth for blueprint/colors/sizes/prices) with the new artwork swapped in, then lets Printify push the listing to Etsy.

## How it works

Two generation paths feed one review → publish pipeline:

- **Paste list** — type slogans, pick font/size/color, and the browser renders print-ready 3000×3600 transparent PNGs via the Canvas API. No AI.
- **Generate with AI** — submit a brief; a durable Vercel Workflow expands it into concepts and generates each design server-side (typography rasterized with resvg, or illustration via Recraft V3).

Then: **review** (approve / reject / regenerate) → **publish** (Gemini drafts the Etsy title/tags/description, a competitive-pricing recommendation runs in parallel) → the server **clones the master Printify product** and publishes → a **photo top-up** uploads extra mockups to Etsy via the seller's OAuth token → a **daily cron** reconciles slow or failed publishes.

## Tech stack

Next.js 16 (App Router, React 19, Turbopack) · TypeScript · Drizzle ORM + Postgres · Vercel Blob · Vercel Workflow · Gemini (+ Groq fallback) · Recraft V3 · Printify & Etsy APIs · Vitest.

## Getting started

```bash
pnpm install
cp .env.example .env.local      # then fill in the values
pnpm db:migrate                  # apply schema to your DATABASE_URL
pnpm dev                         # http://localhost:3000
```

Log in with the `APP_PASSWORD` you set. See [`.env.example`](.env.example) for every required variable; at minimum you need `DATABASE_URL`, `APP_PASSWORD`, `AUTH_COOKIE_SECRET`, `GEMINI_API_KEY`, and `BLOB_READ_WRITE_TOKEN` to run locally, plus `PRINTIFY_API_KEY` / `PRINTIFY_SHOP_ID` to publish.

### Setting up the master product

Publishing is driven entirely by one **master Printify product**. Create a plain product in your Printify dashboard (blueprint, colors, sizes, prices, mockups), publish it to Etsy once manually so its category/shipping config is proven valid, then select it in the app's `/settings`. Every published listing is a clone of this product with the design swapped in.

> Use a **plain** product, not a Printify Studio personalization product — clones of a personalization master fail to publish to Etsy.

## Commands

```bash
pnpm dev            # local dev server
pnpm build          # production build (runs the TypeScript check)
pnpm test           # run the test suite (Vitest)
pnpm test path/to/file.test.ts        # a single test file
pnpm lint           # eslint
pnpm db:generate    # generate a migration after editing lib/db/schema.ts
pnpm db:migrate     # apply pending migrations
```

## Architecture

A deeper map of the codebase — the generation paths, the master-product publish contract, publish-reliability handling, and conventions — lives in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE).
