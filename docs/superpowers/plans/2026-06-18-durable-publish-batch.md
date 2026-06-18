# Durable Publish-Batch Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tab-bound client-loop "Publish all" with a durable Vercel Workflow that publishes a batch one design per step — surviving the 60s function limit, retrying idempotently (no orphan Printify products), and pacing publishes so Printify's queue isn't flooded.

**Architecture:** Extract the per-design publish core out of `POST /api/listings` into a reusable server function (`publishOneDesign`), then drive it from a new `publishBatch` `'use workflow'` orchestrator + `'use step'` functions, mirroring the existing `generateBatch` workflow exactly. A thin trigger route `start()`s the workflow; the existing "Publish all" button calls it and polls status.

**Tech Stack:** Vercel Workflow DevKit (`workflow` / `workflow/api`), Drizzle ORM, Next.js route handlers, Vitest.

---

## File Structure

**Created:**
- `lib/publish/publish-one.ts` — `publishOneDesign()`: the extracted per-design publish core (cap check → dedup → safety → insert row → price → `runPublish` → update row). Returns `{ ok, status?, listingId?, capReached?, error? }`.
- `app/workflows/publish-batch.ts` — `publishBatch(batchId)` orchestrator (`'use workflow'`).
- `app/workflows/publish-steps.ts` — `'use step'` functions: load IDs, draft, publish-one, photos, pause, mark-done.
- `app/api/batches/[id]/publish-all/route.ts` — trigger that `start()`s the workflow.
- `tests/publish-one.test.ts` — unit tests for `publishOneDesign`.

**Modified:**
- `app/api/listings/route.ts` — `POST` becomes a thin wrapper over `publishOneDesign`.
- `app/(app)/batches/[id]/batch-publish.tsx` — call the trigger route + poll, instead of looping client-side.

**Reused unchanged:** `lib/publish/publish-design.ts` (`runPublish`, already supports `preCreatedProductId`), `lib/etsy/price-recommendation.ts`, `lib/ai/listing-copy.ts`, `lib/mockups/process-listing.ts`, `lib/ai/content-safety.ts`, `lib/publish/publish-batch.ts` (pure orchestrator semantics — kept as the reference; the workflow encodes the same branches).

---

## Task 1: Extract `publishOneDesign` core (no behavior change)

**Files:**
- Create: `lib/publish/publish-one.ts`
- Test: `tests/publish-one.test.ts`

This moves the body of `POST /api/listings` into a function. Same logic, same order, same DB writes. The function takes already-validated inputs and returns a plain result object (no `NextResponse`).

- [ ] **Step 1: Write the failing test**

Create `tests/publish-one.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => {
  const listingsRow = { id: 'listing_1' };
  return {
    db: {
      query: {
        settings: { findFirst: vi.fn() },
        designs: { findFirst: vi.fn() },
        listings: { findFirst: vi.fn() },
      },
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [listingsRow]) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => [{ count: 0 }]) })) })),
    },
  };
});
vi.mock('@/lib/publish/publish-design', () => ({ runPublish: vi.fn() }));
vi.mock('@/lib/etsy/price-recommendation', () => ({ recommendPrice: vi.fn(async () => ({ source: 'unavailable', recommendedCents: 0 })) }));
vi.mock('@/lib/ai/content-safety', () => ({ checkSafety: vi.fn(async () => ({ flags: [] })) }));
vi.mock('@/lib/events', () => ({ logEvent: vi.fn(async () => undefined) }));

import { db } from '@/lib/db/client';
import { runPublish } from '@/lib/publish/publish-design';
import { publishOneDesign } from '@/lib/publish/publish-one';

const SETTINGS = { masterPrintifyProductId: 'master_1', killSwitchActive: false, dailyPublishCap: 30, priceOffsetCents: 100, minPriceFloorCents: 1499 };
const DESIGN = { id: 'd1', batchId: 'b1', imageBlobUrl: 'https://blob/x.png', concept: { headline: 'Talk Dogs To Me', niche_keywords: ['dog'] } };

beforeEach(() => {
  vi.mocked(db.query.settings.findFirst).mockResolvedValue(SETTINGS as never);
  vi.mocked(db.query.designs.findFirst).mockResolvedValue(DESIGN as never);
  vi.mocked(db.query.listings.findFirst).mockResolvedValue(undefined as never);
});

describe('publishOneDesign', () => {
  it('returns live with listingId + etsy fields on a fast publish', async () => {
    vi.mocked(runPublish).mockResolvedValue({ status: 'live', printifyProductId: 'p1', etsyListingId: 'e1', etsyUrl: 'https://etsy/e1' } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: true, status: 'live', listingId: 'listing_1', etsyListingId: 'e1' });
  });

  it('returns publishing_slow (queued) when runPublish does not attach fast', async () => {
    vi.mocked(runPublish).mockResolvedValue({ status: 'publishing_slow', printifyProductId: 'p1' } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: true, status: 'publishing_slow', listingId: 'listing_1' });
  });

  it('returns capReached when the daily publish cap is hit', async () => {
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{ count: 30 }] }) } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: false, capReached: true });
  });

  it('blocks on safety flags unless overridden', async () => {
    const { checkSafety } = await import('@/lib/ai/content-safety');
    vi.mocked(checkSafety).mockResolvedValueOnce({ flags: ['trademark'] } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('blocked') });
  });

  it('reuses an existing printifyProductId (idempotent retry — no re-clone)', async () => {
    vi.mocked(db.query.listings.findFirst).mockResolvedValue({ id: 'listing_1', printifyProductId: 'p_existing', status: 'publishing' } as never);
    vi.mocked(runPublish).mockResolvedValue({ status: 'publishing_slow', printifyProductId: 'p_existing' } as never);
    await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] }, { resume: true });
    expect(vi.mocked(runPublish).mock.calls[0][0]).toMatchObject({ preCreatedProductId: 'p_existing' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/publish-one.test.ts`
Expected: FAIL — `Cannot find module '@/lib/publish/publish-one'`.

- [ ] **Step 3: Create `lib/publish/publish-one.ts`**

```typescript
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs, listings } from '@/lib/db/schema';
import { checkSafety } from '@/lib/ai/content-safety';
import { runPublish } from '@/lib/publish/publish-design';
import { recommendPrice } from '@/lib/etsy/price-recommendation';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PublishOneCopy = { title: string; description: string; tags: string[] };

export type PublishOneResult = {
  ok: boolean;
  status?: 'live' | 'publishing_slow';
  listingId?: string;
  etsyListingId?: string;
  etsyUrl?: string;
  capReached?: boolean;
  error?: string;
};

/** The per-design publish core shared by POST /api/listings and the
 *  publishBatch workflow. Same logic the route always had: cap → dedup →
 *  safety → insert row → price → runPublish → update row.
 *
 *  opts.resume: when a listings row already exists for this design with a
 *  printifyProductId (a retried workflow step), reuse it via
 *  runPublish's preCreatedProductId so we never clone a second product. */
export async function publishOneDesign(
  designId: string,
  copy: PublishOneCopy,
  opts: { overrideSafety?: boolean; priceCents?: number; resume?: boolean } = {},
): Promise<PublishOneResult> {
  const s = await db.query.settings.findFirst();
  if (!s) return { ok: false, error: 'Settings missing' };
  if (s.killSwitchActive) return { ok: false, error: 'Kill switch active' };
  if (!s.masterPrintifyProductId) return { ok: false, error: 'No master Printify product selected.' };

  const since = new Date(Date.now() - DAY_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(gte(listings.createdAt, since));
  if (count >= s.dailyPublishCap) {
    return { ok: false, capReached: true, error: `Daily publish cap reached (${count}/${s.dailyPublishCap})` };
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return { ok: false, error: 'Design not found' };
  if (!design.imageBlobUrl) return { ok: false, error: 'Design has no image' };

  const existing = await db.query.listings.findFirst({
    where: and(eq(listings.designId, designId), sql`status in ('publishing','publishing_slow','live')`),
  });
  // On a fresh publish an existing in-flight row is a conflict. On resume
  // (workflow retry) we reuse that row + its product instead of cloning.
  let listingId: string;
  let preCreatedProductId: string | undefined;
  if (existing) {
    if (!opts.resume) return { ok: false, error: 'Design already published or publishing' };
    listingId = existing.id;
    preCreatedProductId = existing.printifyProductId ?? undefined;
  } else {
    if (!opts.overrideSafety) {
      const safety = await checkSafety({
        headline: (design.concept as Concept).headline,
        illustrationPrompt: 'n/a',
        title: copy.title,
        description: copy.description,
        tags: copy.tags,
      });
      if (safety.flags.length > 0) return { ok: false, error: `Content blocked: ${safety.flags.join(', ')}` };
    }
    const [row] = await db.insert(listings).values({
      designId, title: copy.title, description: copy.description, tags: copy.tags,
      status: 'publishing', editedByUser: true,
    }).returning();
    listingId = row.id;
  }

  await db.update(designs).set({ status: 'publishing' }).where(eq(designs.id, designId));

  let basePriceCents: number | null = null;
  if (typeof opts.priceCents === 'number') {
    basePriceCents = Math.max(opts.priceCents, s.minPriceFloorCents);
  } else {
    try {
      const rec = await recommendPrice({
        concept: {
          headline: (design.concept as Concept).headline,
          niche_keywords: (design.concept as Concept).niche_keywords ?? [],
        },
        settings: { priceOffsetCents: s.priceOffsetCents, minPriceFloorCents: s.minPriceFloorCents },
      });
      if (rec.source !== 'unavailable' && typeof rec.recommendedCents === 'number') {
        basePriceCents = rec.recommendedCents;
      }
    } catch { /* non-blocking — master prices win */ }
  }

  try {
    const result = await runPublish({
      designImageUrl: design.imageBlobUrl,
      fileName: `design_${designId}.png`,
      masterProductId: s.masterPrintifyProductId,
      title: copy.title,
      description: copy.description,
      tags: copy.tags,
      basePriceCents,
      preCreatedProductId,
    });

    if (result.status === 'live') {
      await db.update(listings).set({
        printifyProductId: result.printifyProductId,
        etsyListingId: result.etsyListingId,
        status: 'live',
        publishedAt: new Date(),
      }).where(eq(listings.id, listingId));
      await db.update(designs).set({ status: 'live' }).where(eq(designs.id, designId));
      await logEvent({ type: 'published', designId, batchId: design.batchId,
        payload: { etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl } });
      return { ok: true, status: 'live', listingId, etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl };
    }

    await db.update(listings).set({
      printifyProductId: result.printifyProductId, status: 'publishing_slow',
    }).where(eq(listings.id, listingId));
    return { ok: true, status: 'publishing_slow', listingId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.update(listings).set({ status: 'failed', failureReason: reason.slice(0, 500) }).where(eq(listings.id, listingId));
    await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, designId));
    await logEvent({ type: 'publish_failed', designId, batchId: design.batchId, payload: { reason: reason.slice(0, 500) } });
    return { ok: false, error: reason, listingId };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/publish-one.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Refactor `POST /api/listings` to call `publishOneDesign`**

In `app/api/listings/route.ts`, replace everything from the `const design = ...` load (line ~61) through the end of the `catch` block with a single call. Keep the body parse + the early `settings`/`killSwitch`/`master` guards OR move them into the function (the function repeats them harmlessly). Minimal version — after parsing `{ design_id, title, tags, description, override_safety, price_cents }`:

```typescript
  const r = await publishOneDesign(design_id, { title, description, tags }, {
    overrideSafety: override_safety,
    priceCents: typeof price_cents === 'number' ? price_cents : undefined,
  });

  if (r.capReached) return NextResponse.json({ ok: false, error: r.error }, { status: 429 });
  if (!r.ok) {
    const status = r.error?.startsWith('Content blocked') ? 422 : 502;
    return NextResponse.json({ ok: false, error: r.error, listingId: r.listingId }, { status });
  }
  return NextResponse.json(
    { ok: true, listingId: r.listingId, status: r.status, etsyListingId: r.etsyListingId, etsyUrl: r.etsyUrl },
    { status: r.status === 'live' ? 200 : 202 },
  );
```

Add `import { publishOneDesign } from '@/lib/publish/publish-one';` and remove now-unused imports (`runPublish`, `recommendPrice`, `checkSafety`, `listings`/`designs` table refs if no longer used, `logEvent`). Keep `export const runtime = 'nodejs'` and `maxDuration`.

- [ ] **Step 6: Run the full suite to verify no regression**

Run: `pnpm test`
Expected: all pass (existing listing-route behavior preserved; +5 new).

- [ ] **Step 7: Commit**

```bash
git add lib/publish/publish-one.ts tests/publish-one.test.ts app/api/listings/route.ts
git commit -m "refactor(publish): extract publishOneDesign core from /api/listings (idempotent resume)"
```

---

## Task 2: Workflow steps

**Files:**
- Create: `app/workflows/publish-steps.ts`

Each is a thin `'use step'` wrapper over existing server logic, idempotent.

- [ ] **Step 1: Create `app/workflows/publish-steps.ts`**

```typescript
import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { draftListingCopy } from '@/lib/ai/listing-copy';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { publishOneDesign, type PublishOneCopy } from '@/lib/publish/publish-one';
import { processListingPhotos } from '@/lib/mockups/process-listing';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export async function loadApprovedDesignIdsStep(batchId: string): Promise<string[]> {
  'use step';
  const rows = await db.select({ id: designs.id }).from(designs)
    .where(and(eq(designs.batchId, batchId), eq(designs.status, 'approved')))
    .orderBy(asc(designs.createdAt));
  return rows.map((r) => r.id);
}

export async function draftOneStep(designId: string): Promise<{ ok: boolean; copy?: PublishOneCopy; error?: string }> {
  'use step';
  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return { ok: false, error: 'Design not found' };
  const concept = design.concept as Concept;

  let garment: string | null = null;
  try {
    const s = await _db.query.settings.findFirst();
    if (s?.masterPrintifyProductId) {
      const master = await fetchMasterProduct(s.masterPrintifyProductId);
      garment = await getGarmentDescriptor(master.blueprintId);
    }
  } catch { /* garment is best-effort; copy falls back to its default */ }

  try {
    const draft = await draftListingCopy({ slogan: concept.headline, garment: garment ?? undefined });
    return { ok: true, copy: { title: draft.title, description: draft.description, tags: draft.tags } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function publishOneStep(designId: string, copy: PublishOneCopy) {
  'use step';
  // resume:true → if a prior attempt of this step created the Printify product
  // and recorded it on the listings row, reuse it instead of cloning again.
  return publishOneDesign(designId, copy, { resume: true });
}

export async function uploadPhotosStep(listingId: string): Promise<{ ok: boolean; error?: string }> {
  'use step';
  try {
    const r = await processListingPhotos(listingId);
    return { ok: r.ok, error: r.ok ? undefined : (r as { message?: string }).message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pauseStep(ms: number): Promise<void> {
  'use step';
  await new Promise((r) => setTimeout(r, ms));
}

export async function markBatchPublishedStep(batchId: string, summary: Record<string, number>) {
  'use step';
  await logEvent({ type: 'generated', batchId, payload: { kind: 'publish_batch_done', ...summary } });
}
```

> Note: `draftListingCopy` returns `{ title, description, tags, ... }` — confirm field names against `lib/ai/listing-copy.ts` when implementing; adapt the mapping in `draftOneStep` if they differ.

- [ ] **Step 2: Typecheck**

Run: `pnpm build 2>&1 | head -30`
Expected: compiles (the `'use step'` files are picked up by the workflow build). Fix any import-name mismatches surfaced (esp. `draftListingCopy` return shape).

- [ ] **Step 3: Commit**

```bash
git add app/workflows/publish-steps.ts
git commit -m "feat(publish): durable workflow steps (draft, publish-one, photos, pause)"
```

---

## Task 3: Workflow orchestrator

**Files:**
- Create: `app/workflows/publish-batch.ts`

Encodes the same branch logic as `lib/publish/publish-batch.ts` (`publishApprovedDesigns`): continue-on-failure, stop-at-cap, `publishing_slow` ⇒ queued (no photo step), live-with-failed-photos still counts. Adds a paced delay between designs.

- [ ] **Step 1: Create `app/workflows/publish-batch.ts`**

```typescript
import {
  loadApprovedDesignIdsStep,
  draftOneStep,
  publishOneStep,
  uploadPhotosStep,
  pauseStep,
  markBatchPublishedStep,
} from './publish-steps';

// Gap between designs so Printify's publish queue (capped at 200/30min) is not
// flooded. Sequential by design — durability + pacing beat parallel throughput
// for a 20-100 item batch.
const PACE_MS = 5000;

export async function publishBatch(batchId: string) {
  'use workflow';

  const designIds = await loadApprovedDesignIdsStep(batchId);
  const summary = { published: 0, queued: 0, failed: 0, skipped: 0 };
  let stoppedAtCap = false;

  for (const designId of designIds) {
    if (stoppedAtCap) { summary.skipped++; continue; }

    const drafted = await draftOneStep(designId);
    if (!drafted.ok || !drafted.copy) { summary.failed++; continue; }

    const pub = await publishOneStep(designId, drafted.copy);
    if (pub.capReached) { stoppedAtCap = true; summary.skipped++; continue; }
    if (!pub.ok) { summary.failed++; continue; }
    if (pub.status === 'publishing_slow' || !pub.listingId) { summary.queued++; await pauseStep(PACE_MS); continue; }

    const photos = await uploadPhotosStep(pub.listingId);
    summary.published++; // live regardless of photo outcome (cron backfills)
    void photos;

    await pauseStep(PACE_MS);
  }

  await markBatchPublishedStep(batchId, summary);
  return { ok: true, ...summary };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build 2>&1 | head -30`
Expected: compiles; `app/.well-known/workflow/` regenerates with the new flow.

- [ ] **Step 3: Commit**

```bash
git add app/workflows/publish-batch.ts
git commit -m "feat(publish): publishBatch durable workflow orchestrator (paced, continue-on-failure)"
```

---

## Task 4: Trigger route

**Files:**
- Create: `app/api/batches/[id]/publish-all/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { batches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { start } from 'workflow/api';
import { publishBatch } from '@/app/workflows/publish-batch';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 });

  const run = await start(publishBatch, [id]);
  return NextResponse.json({ ok: true, runId: run.runId });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build 2>&1 | head -20`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add "app/api/batches/[id]/publish-all/route.ts"
git commit -m "feat(publish): POST /api/batches/[id]/publish-all starts the durable workflow"
```

---

## Task 5: Rewire the "Publish all" button

**Files:**
- Modify: `app/(app)/batches/[id]/batch-publish.tsx`

Read the file first. Replace the client-side `publishApprovedDesigns(...)` loop with a single POST to the trigger route, then let the existing `onDone`/refresh polling reflect progress via design-row statuses.

- [ ] **Step 1: Read the current component**

Run: `cat "app/(app)/batches/[id]/batch-publish.tsx"`

- [ ] **Step 2: Replace the publish handler**

Swap the body of the click handler so it does:

```typescript
const res = await fetch(`/api/batches/${batchId}/publish-all`, { method: 'POST' });
const j = await res.json();
if (!j.ok) { setError(j.error ?? 'Failed to start'); return; }
// Workflow runs server-side; poll batch status for progress.
onDone();
```

Keep the button label/disabled states. Update copy to reflect that it now runs in the background (e.g. "Publishing in the background — you can close this tab."). Remove the now-unused import of `publishApprovedDesigns` and its fetch-dep wiring from this component (the pure helper stays in `lib/` for reference/tests).

- [ ] **Step 3: Typecheck + lint the file**

Run: `pnpm build 2>&1 | head -20 && npx eslint "app/(app)/batches/[id]/batch-publish.tsx"`
Expected: compiles; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/batches/[id]/batch-publish.tsx"
git commit -m "feat(publish): Publish-all button triggers durable workflow (tab-independent)"
```

---

## Task 6: Full verification

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Production build (regenerates workflow runtime)**

Run: `pnpm build 2>&1 | tail -20`
Expected: "Compiled successfully"; `app/.well-known/workflow/` updated (do not hand-edit).

- [ ] **Step 3: Confirm the workflow runtime registered both workflows**

Run: `ls app/.well-known/workflow/ && grep -rl "publishBatch" app/.well-known/workflow/ | head`
Expected: generated flow/step routes reference `publishBatch`.

- [ ] **Step 4: Commit any regenerated runtime files**

```bash
git add -A && git commit -m "build: regenerate workflow runtime for publishBatch" || echo "nothing to commit"
```

---

## Manual E2E (after deploy)

Deploy (`vercel --prod --yes`), then on a small fresh batch: click "Publish all", close the tab, and confirm via `/listings` + the Printify dashboard that designs publish with no 504s and **no orphan products** (one Printify product per design). Compare product count before/after to the number of designs.
