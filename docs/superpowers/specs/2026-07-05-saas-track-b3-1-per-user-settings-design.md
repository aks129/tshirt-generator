# Design: SaaS Track — Phase B-3.1: Per-user settings

**Date:** 2026-07-05
**Status:** Approved (user: "proceed" into B-3)

## Context

`settings` is a singleton (`id=1`) read in 17 places. It holds each tenant's
config: master Printify product, caps, price floor/offset, kill switch, Etsy
OAuth tokens + shop id, mockup selection. To sell the tool, config must be
per-user. This is the foundation B-3.2 (per-user credentials), B-3.3 (billing),
and metering all build on. B-1 already added `settings.user_id` (backfilled to
the founder).

## The risk

Making `settings` multi-row breaks every `db.query.settings.findFirst()` — with
>1 row it returns an arbitrary one. So all 17 sites must move to a user-scoped
accessor atomically.

## Design

### id strategy (non-destructive)

Keep `id` (integer PK) — the founder's row stays `id=1`. Add a **unique index
on `user_id`**. New rows get `id = max(id)+1`, assigned by the accessor (rare —
one row per user, created on first settings save). No PK-type migration.

### Accessor — `lib/settings/accessor.ts`

- `getSettingsForUser(userId)` → the user's row, creating a default one
  (find-or-create, `onConflictDoNothing(userId)` + re-read for race safety).
- `getSettingsForBatch(batchId)` / `getSettingsForDesign(designId)` /
  `getSettingsForListing(listingId)` → resolve the owner, then
  `getSettingsForUser`. For the by-id API/workflow sites that have an entity id
  but not a user in scope.
- `getFounderSettings()` → the `role='founder'` user's settings. Used by the
  **cross-user background crons** (stats, reconcile) which iterate all tenants;
  true per-user cron iteration is deferred to **B-3.1b** (correct today because
  only the founder has data).

### Caps become per-user

`lib/caps/enforcement.ts`: `canStartBatch({ requestedCount, userId })` and
`killSwitchActive(userId)` read that user's settings and count that user's
daily designs/publishes (join through batches for designs). Callers:
`/api/batches` + `/api/bulk-batches` (have the request user), workflow
`checkCapsStep` / `generateOneDesignStep` (resolve via the batch owner).

### Touch points (all 17 reads → accessor)

- Pages: dashboard, settings (current user).
- Publish path `publish-one.ts`: owner via the design's batch (already looked up
  there for listing stamping).
- By-id routes (draft-listing, price-recommendation, listings custom-mockups,
  retry, upload-saved-mockups) + `process-listing.ts`, `preflight/checks.ts`,
  `oauth-client.ts`: resolve via the entity id.
- Workflow `publish-steps.ts` garment lookup: via batch owner.
- Crons `stats`, `reconcile`: `getFounderSettings()` (B-3.1b makes per-user).

## Non-goals (later)

- Per-user Printify API key / Etsy OAuth entry (**B-3.2** — needs an
  at-rest-encryption + security decision).
- Stripe billing / plan entitlements (**B-3.3** — pricing decision + Stripe).
- Per-user cron iteration (**B-3.1b**).
- Tightening `user_id` NOT NULL.

## Testing

- Unit: `getSettingsForUser` find-vs-create; caps scoping (mock db) — user with
  no rows under cap vs at cap.
- Full suite green; **founder behavior unchanged** (their `id=1` row is what all
  resolvers return for them). Verify in prod: generate/publish/settings still
  work; caps still enforce.

## Success criteria

- Every settings read is user-scoped; a second user gets their own settings row
  and their own caps, isolated from the founder.
- Zero behavior change for the founder. All tests green.
