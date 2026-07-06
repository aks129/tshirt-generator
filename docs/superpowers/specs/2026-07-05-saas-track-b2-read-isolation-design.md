# Design: SaaS Track — Phase B-2.1: Read-path tenant isolation

**Date:** 2026-07-05
**Status:** Approved (user: "continue" into B-2)

## Context

B-1 shipped identity + `user_id` ownership columns (backfilled to the founder)
+ `getRequestUser(req)`. Today every read still returns ALL data — a second
user would see the founder's catalog. B-2.1 scopes the **read surface** so each
user sees only their own batches/designs/listings. Registration stays
invite-gated, so this ships safely before the mutation-guard follow-up.

## Scope (this increment)

**In:** scope the tenant-data reads to the session user —
- server-component pages: dashboard, listings, batch-detail
- `GET /api/batches/[id]` (used by the review-grid poller) — 404 on non-owned
- a `getCurrentUser()` helper usable from server components (cookies-based),
  sharing the resolver with `getRequestUser(req)`

**Out (explicit follow-ups):**
- **B-2.2 mutation ownership guards** — the ~17 by-ID mutation routes
  (approve/reject/regenerate/delete/publish/photos/…) must verify ownership
  before a real second user is invited. Tracked as a hard gate.
- **B-3 per-user settings + integrations** — `settings` stays founder-scoped
  (its `id=1` singleton PK needs a real per-user refactor, which belongs with
  per-user Printify/Etsy onboarding + billing). Dashboard setup banners read
  the founder settings row; harmless while only the founder exists.

## Design

### `getCurrentUser()` (server components)

`lib/auth/current-user.ts` gains a second entry point using `next/headers`
`cookies()` (Next 16 async). Both `getRequestUser(req)` and `getCurrentUser()`
delegate to one `resolveUser(token)` (verify → legacy⇒founder → lookup).

### Scoping rule

- `batches` / `listings`: `where user_id = currentUser.id`.
- `designs`: no direct `user_id` — scope via inner join to `batches` filtered
  by `batches.user_id` (dashboard aggregates), or by owned `batchId` (batch
  detail).
- No current user (shouldn't happen behind middleware) → treat as empty
  result / redirect to /login; never leak.

### Touch points

- `app/(app)/page.tsx` — weekStats/todayStats (designs⨝batches by owner),
  recent batches (`batches.userId`), publishQueue + "what's selling"
  (`listings.userId`).
- `app/(app)/listings/page.tsx` — `listings.userId = user.id`.
- `app/(app)/batches/[id]/page.tsx` — `notFound()` unless `batch.userId ===
  user.id`.
- `app/api/batches/[id]/route.ts` GET — 404 unless owned.

## Testing

- Unit: `resolveUser` legacy⇒founder + user lookup already covered
  (auth-session/auth-users tests). Add a scoping-helper test if a pure helper
  is extracted; otherwise the page queries are integration-level (verified in
  prod: founder still sees their full catalog after deploy).
- Full suite stays green; founder (owns all backfilled rows) sees no change.

## Success criteria

- Founder's dashboard/listings/batch pages render exactly as before (they own
  everything).
- A different logged-in user sees an empty catalog and cannot open the
  founder's batch by ID (`GET /api/batches/[id]` 404, page notFound).
- No behavior change to publishing/generation. All tests green.
