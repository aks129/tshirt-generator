# Design: Durable publish-batch workflow

**Date:** 2026-06-18
**Status:** Proposed (awaiting review)

## Why

The client-loop "Publish all" (`batch-publish.tsx` → per-design `POST /api/listings`) works for ~5 tees but broke empirically on a 25-tee run:

- **Vercel 60s timeout → orphan products.** A slow publish returns 504 to the browser while the server keeps running; the operator retries and a *new* Printify product is minted each time. The 25-tee run left ~11 unlocked-no-Etsy products on the shop, several of them retry duplicates.
- **Printify queue flooding.** Firing 20+ publishes back-to-back leaves products "unlocked, no external" instead of going live.
- **Tab-bound.** The loop dies if the operator closes the tab.

The fix is the increment already flagged in the 2026-06-10 retrospective: run the batch as a **durable Vercel Workflow** (same WDK pattern as `generateBatch`), one design per step. Steps survive the 60s limit (each is its own execution), retry idempotently, and serialize with a deliberate gap so Printify's queue isn't flooded.

## Non-goals (YAGNI)

- No change to the single-design publish modal (still the hand-edit path).
- No new pricing/copy logic — reuse `recommendPrice`, `draftListingCopy`, `runPublish`, `processListingPhotos` exactly as the modal/route already do.
- No rewrite of the existing `publishApprovedDesigns` pure orchestrator's *control flow* — we keep its semantics (continue-on-failure, stop-at-cap, queued≠failed), just move execution into durable steps.
- No orphan-cleanup automation here (separate, see Risks).

## Architecture

Mirror `generateBatch` exactly.

### Extract the publish core (no behavior change)

Today `POST /api/listings` inlines: safety check → cap check → `recommendPrice` → `runPublish` → insert `listings` row. Extract that body into a reusable server function so the route **and** the workflow step share one implementation:

- `lib/publish/publish-one.ts` → `publishOneDesign(designId, copy, opts?) : Promise<{ ok; status?; listingId?; capReached?; error? }>` — exactly the shape the pure orchestrator's `publish` dep already expects.
- `POST /api/listings` becomes a thin caller of `publishOneDesign` (regression-guarded by existing tests).

### Workflow + steps (new)

- `app/workflows/publish-batch.ts` — `publishBatch(batchId)` marked `'use workflow'`. Deterministic; loops the batch's approved design IDs and calls steps. Encodes the same branch logic as `publishApprovedDesigns` (drafting → publishing → photos; cap stops the loop; `publishing_slow` ⇒ queued, no photo step; live-with-failed-photos still counts).
- Steps in `app/workflows/publish-steps.ts` (each `'use step'`, idempotent):
  - `loadApprovedDesignIdsStep(batchId)` → string[]
  - `draftOneStep(designId)` → `{ ok; copy?; error? }` (wraps `draftListingCopy` + garment resolution, same as the draft route)
  - `publishOneStep(designId, copy)` → calls `publishOneDesign` (the extracted core)
  - `uploadPhotosStep(listingId)` → wraps `processListingPhotos`
  - `markBatchPublishedStep(batchId, summary)` — logs an event with the tally
  - Between designs the orchestrator `await`s a short fixed delay step (`pauseStep(ms)`) so Printify's publish queue isn't flooded (default ~5s; tunable constant).

Idempotency: `publishOneStep` must not create a second Printify product if retried after a partial success. `runPublish` already accepts `preCreatedProductId`; the step records the created `printifyProductId` on the `listings` row immediately after `createProductFromMaster`, and on retry reuses it. (This is the specific orphan-prevention guarantee the client loop lacked.)

### Trigger

- `POST /api/batches/[id]/publish-all` — auth-gated; loads the batch, `start(publishBatch, [batchId])`, stores the run id. Returns `{ ok, runId }` immediately (no long-held request).
- Rewire `batch-publish.tsx`'s existing "Publish all" button to call this endpoint, then poll batch/design status for progress (the design rows already flip drafting→publishing→live), instead of driving the loop itself.

### Progress tracking

Reuse existing row statuses — no schema change required. `designs.status` and `listings.status` already move through the lifecycle; the UI polls `GET /api/batches/[id]`. (Optional later: a `publishRunId` column on `batches`, mirroring `workflowRunId`. Deferred.)

## Error handling

- Per-design step failure → design marked `failed` with reason (as today); workflow continues.
- Cap reached → orchestrator stops launching new publishes (checks `canStartBatch`/cap before each, or honors `capReached` from the step), remaining designs left `approved`.
- A step that throws is retried by the WDK; idempotent product reuse prevents duplicate Printify products across retries.
- Silent Printify failures still caught by the existing reconcile cron + `classifyStuckPublish`.

## Testing

- **Pure logic** is already covered by `tests/publish-batch.test.ts` (the orchestrator semantics) — keep it; the workflow orchestrator delegates to the same branch logic.
- **`publishOneDesign` extraction:** add `tests/publish-one.test.ts` asserting the same outcomes the route produced (cap → capReached; slow → publishing_slow; success → listingId), mocking `runPublish`/`recommendPrice`/db at the module boundary.
- **Idempotency:** test that `publishOneStep`, given a design whose `listings` row already has a `printifyProductId`, calls `runPublish` with `preCreatedProductId` and does not clone again.
- Build must regenerate `app/.well-known/workflow/` cleanly (never hand-edited).
- **E2E (manual):** trigger publish-all on a fresh small batch; confirm no 504s, no orphan products, all reach Etsy.

## Success criteria

- A 20-tee batch publishes with **zero orphan Printify products** and no operator-visible 504s.
- Closing the browser tab does not stop the batch.
- Printify queue isn't flooded (paced); silent failures still surface as `failed` via cron.
- The single-design modal path is byte-for-byte unchanged in behavior.

## Risks

- **Existing orphans** (~11 from the 25-tee run) are out of scope — they need a one-off cleanup (delete unlocked + no-external products with no live listing row) once the in-flight publishes settle. Tracked separately.
- The `/api/listings` extraction is the one regression-risk touch point; the existing route tests are the guard.
