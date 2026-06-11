# Design: Make Printify-managed Etsy publish reliable

**Date:** 2026-06-05
**Status:** Approved
**Branch:** feature/plan-1

## Goal

Listings published through the app reliably reach Etsy (with all colors, sizes,
prices, and mockups), and when a publish does fail it is **visible** — never a
silent, permanent `publishing_slow`. Keep Printify's managed Etsy publish (so
order fulfillment stays automatic); do not switch to direct Etsy API publishing.

## Background / root cause

Dogfooding surfaced that cloned products never reach Etsy: the Printify product
is created correctly (right blueprint, 30 variants, 7 images, `visible: true`)
and `POST .../publish.json` returns 2xx, but the product's `external` stays
`null` and `is_locked` returns to `false` — Printify accepts the publish but no
Etsy listing is created, with no error exposed via the product GET API.

The Printify dashboard shows a **generic** error: *"Unexpected error occurred.
Please contact support for help."* — not a specific Etsy validation message
(which would name shipping profile / taxonomy / return policy). The current
master is a **Printify Studio personalization product** (`sales_channel_properties.personalisation`,
`strategy: "pstudio"`, a `personalize.at` link). Clones drop `sales_channel_properties`
entirely. The master itself is live on Etsy; plain clones derived from it throw
the generic error. Conclusion: clones of a personalization master end up in a
state Printify cannot publish to Etsy. The fix is to get onto a clean plain
master and stop failing silently. (Confirmed by deep research: Printify managed
publish fails silently; the failure reason is only in the dashboard.)

## Non-goals (YAGNI)

- No direct Etsy Open API v3 publishing (would break Printify auto-fulfillment).
- No Etsy→Printify order-sync subsystem.
- No Printify webhooks (payloads unverified in research; reconcile-polling is
  sufficient at 5–100/day). Noted as a future option.

## Plan

### §1 — Clean plain master (operator setup, no code)

Operator creates a **plain** Printify product — standard blueprint (Comfort
Colors 1717 or Bella+Canvas 3001), desired colors/sizes/prices/mockups, **no
personalization** — configures its Etsy publish settings (category, shipping
profile), and **publishes it to Etsy once manually** to prove the config is
valid. Then selects it as the master in `/settings`. Primary lever: clones of a
clean, Etsy-valid master are what publish reliably.

### §2 — Code change A: copy the master's Etsy config on clone

- `lib/printify/master-product.ts`: add `salesChannelProperties` to
  `MasterProductSpec` and populate it from the product GET response.
- `lib/printify/create-product.ts`: include `sales_channel_properties` in the
  `POST /products.json` body so clones inherit the master's shipping/category/
  attributes.
- **Verification gate (implementation):** confirm Printify accepts
  `sales_channel_properties` on product creation. If the API rejects it or
  treats it as read-only, **drop this change** and rely on §1. The plan must
  start by verifying this against the live API before building on it.

### §3 — Code change B: make failures visible (stop silent `publishing_slow`)

Today the reconcile cron only flips `publishing_slow → live`; a failed Etsy
publish stays `publishing_slow` forever. Add detection:

- In the reconcile pass (`app/api/cron/reconcile/route.ts`), for a listing in
  `publishing` / `publishing_slow` older than the existing 1h cutoff: fetch the
  Printify product. If it is **unlocked AND has no `external`** (publish settled
  without creating an Etsy listing), mark the listing `failed` with
  `failureReason`: "Printify accepted the publish but no Etsy listing was
  created — check the Printify dashboard." Also set the design back to `failed`.
- Extract the decision into a small pure helper so it is unit-testable:
  `classifyStuckPublish({ isLocked, hasExternal, ageMs, cutoffMs })` →
  `'live' | 'failed' | 'wait'`.
- `getProduct` already returns `etsyListingId`/`etsyUrl`; extend it to also
  return `isLocked` (from the product's `is_locked`) so the cron can decide.
- The `/listings` UI already renders `failureReason`, so failed publishes become
  visible with no UI change.

### §4 — Code change C: rate-limit backoff

`lib/printify/client.ts` `printifyFetch` currently retries once on 5xx. Add
**429 handling**: on HTTP 429, read `Retry-After` (seconds), wait that long
(capped at **10 s**) and retry. If no `Retry-After` header, fall back to
exponential backoff (1 s, 2 s, 4 s). **Max 3 retry attempts** total, then
throw. Apply the
same 429+`Retry-After` handling to the Etsy image-upload helper
(`lib/mockups/upload-to-etsy.ts`). Rationale: Printify caps publishing at
200/30min; Etsy enforces QPS+QPD and returns `429 + Retry-After`.

## Error handling

- §3 is the core error-handling change: silent stalls become visible `failed`
  rows with a human-readable reason.
- §4 prevents rate-limit 429s from surfacing as hard failures during 20–100/day
  batches.
- Publish path otherwise unchanged: clone → publish → poll → live/slow; slow now
  resolves to live OR failed via reconcile (never infinite).

## Testing

- **Unit:** `classifyStuckPublish` truth table (live when external; failed when
  unlocked+no-external+aged; wait when locked or under cutoff). `printifyFetch`
  429 path (mock fetch: 429+`Retry-After` then 200 → succeeds; honors the
  header; caps attempts). If §2 kept: assert `sales_channel_properties` present
  in the create payload (mocked).
- **E2E (manual, live):** on the clean plain master, publish one cat design via
  the modal; confirm it reaches Etsy with all colors/sizes + mockups; then run
  "Publish all" for the rest.

## Success criteria

- A design published on the clean master reaches Etsy `live` with full
  colors/sizes/prices and mockups.
- A publish that fails on Printify's side flips to `failed` (with reason) within
  the reconcile window — no permanent silent `publishing_slow`.
- Batch publishing 5→20 doesn't hit unhandled 429s.
