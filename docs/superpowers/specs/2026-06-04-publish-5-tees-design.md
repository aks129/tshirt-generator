# Design: Publish 5 best-seller tees today, built to scale to 20/100

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Branch:** feature/plan-1

## Goal

Get the website actually publishing t-shirts end-to-end, today. Produce **5 live
Etsy listings** that match the profile of best sellers, then make the same flow
repeatable for 20 and 100.

Each published listing must carry, with no manual per-variant work:

- The master Printify product's **full color set, full size set, and per-variant
  prices** (the master is the single source of truth; the app clones it).
- **Dynamic pricing** — the competitive recommendation shifts the master's base
  price; the size-upcharge curve is preserved.
- **All mockups on Etsy** — the 1 Printify auto-publishes plus the remaining ~9
  uploaded via the seller's Etsy OAuth photo top-up.
- An **Etsy best-practice listing**: front-loaded title, exactly 13 tags,
  3-paragraph description, with an **accurate garment/material line**.

Phase-1 designs are **text-on-shirt** (curated best-seller quote packs, rendered
via the paste-list canvas path). Image-generated designs are explicitly later.

## Confirmed context (operational readiness)

- Master Printify product is **set up and selected** in `/settings` (colors,
  sizes, per-variant prices, curated mockups).
- Etsy shop is **connected** via OAuth (photo top-up can run).
- Quote source: **curated best-seller packs** (`lib/themes/library.ts`).
- Render path: **paste-list canvas** (`bulk-generator.tsx` → `/api/bulk-batches`),
  pixel-perfect text, no AI artifacts.

## Current pipeline (already built — reused, not rebuilt)

1. Paste-list canvas generator → `POST /api/bulk-batches` → batch + design rows.
2. Review queue `/batches/[id]` → approve designs.
3. Publish modal (per design): `POST /api/designs/[id]/draft-listing` (Gemini
   copy) + `POST /api/designs/[id]/price-recommendation` (competitive rec) →
   `POST /api/listings` clones the master, applies dynamic pricing, publishes;
   Printify auto-publishes the front mockup.
4. `POST /api/listings/[id]/photos` uploads the remaining mockups to Etsy.

**Gap for scale:** publishing is one-design-at-a-time through the modal. There is
an *approve-all* action but no *publish-all*. That blocks 20/100.

**Production-grade nit:** `lib/ai/listing-copy.ts` hardcodes "Bella+Canvas 3001,
DTG, true to size" in the description. If the master is a different blueprint,
every description is factually wrong.

## Plan

### Phase 0 — Verify ONE end-to-end (de-risk before automating)

Drive a single real publish against live config to prove transfer correctness
**before** writing automation.

- Paste 1 curated quote → canvas render → upload → `/api/bulk-batches` → review →
  approve → publish, driven via the Playwright browser tool on the live site.
- Inspect the resulting **Etsy listing + Printify product** and confirm:
  - [ ] all master variant **colors** present
  - [ ] all master **sizes** present
  - [ ] **per-variant prices** correct; dynamic base price applied
  - [ ] **all ~10 mockups** present on Etsy (1 auto + top-up)
  - [ ] title (front-loaded), **exactly 13 tags**, 3-paragraph description
- This listing becomes the **first of the 5** (nothing wasted).
- **Output:** pass/fail checklist. Failures are fixed in Phase 1 before scaling.

Creates one real, live Etsy listing — explicitly consented.

### Phase 1 — Fixes + accurate garment copy

- Fix whatever Phase 0 surfaces (unknown until run).
- **Material-from-master:** a small helper resolves the master's blueprint
  identity (brand + model + title, e.g. "Bella+Canvas 3001") from Printify's
  cached catalog and injects it into the description generator, replacing the
  hardcoded line. **Falls back** to the current generic line if the lookup fails,
  so copy generation never breaks.
  - Touch points: `lib/ai/listing-copy.ts` (accept a `garment` descriptor),
    `app/api/designs/[id]/draft-listing/route.ts` (resolve + pass it), a small
    descriptor helper under `lib/printify/`.

### Phase 2 — "Publish all approved" batch action

- New button on `/batches/[id]`. For each approved design, **sequentially**:
  draft copy → `POST /api/listings` (dynamic pricing happens server-side) →
  `POST /api/listings/[id]/photos`.
- **Client-driven loop** reusing existing, tested endpoints. New code is a client
  orchestration component + progress UI. No new server pipeline.
- Batch **auto-uses the AI-drafted copy** (no manual edit step per design); the
  existing per-design publish modal stays available for hand-editing one-offs.
- Live progress per design: drafting → pricing → publishing → photos → ✅/❌.
- **Continue-on-failure** (one bad design doesn't halt the batch).
- **Cap-aware:** stops cleanly with a message when the daily publish cap is hit
  (server already enforces `dailyPublishCap`; UI surfaces it).
- Run it for the remaining 4 → **5 live today**. Same button serves 20 next time.

## Scope boundaries (YAGNI today)

- **Scale to 100:** the client-loop is fine for 5–20 (tab open ~7 min for 20).
  For 100 the correct tool is a durable `publishBatch` Vercel Workflow (survives
  tab close, step-per-design retries). Flagged as the **next increment after the
  process is proven** — not built today.
- **Image-generated designs:** deferred (text-on-shirt only now).
- **No** new generation modes, no eRank wiring, no refactors beyond the two fixes.

## Risks / preconditions

- Daily **publish cap** in `/settings` must be ≥ 5 today (≥ 20 / ≥ 100 later) or
  the batch stops early. Verify before running.
- Etsy token must be valid at run time; expired token → photos saved but not
  uploaded (existing graceful handling), surfaced in progress.
- Printify→Etsy publish queue is async; slow publishes flip to `publishing_slow`
  and are reconciled by the existing daily cron — batch progress reflects this.

## Success criteria

- 5 Etsy listings live (or queued and reconciling) with full colors/sizes/prices,
  dynamic pricing, all mockups, and accurate best-practice copy.
- "Publish all approved" reliably processes a batch, continues past failures, and
  respects caps — proven on the 5, ready for 20.
