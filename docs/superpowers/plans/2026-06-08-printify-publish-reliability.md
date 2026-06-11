# Printify Publish Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Printify-managed Etsy publishes reliable by propagating Etsy config on clone, surfacing silent failures via `classifyStuckPublish`, and adding 429 rate-limit backoff to Printify and Etsy API calls.

**Architecture:** Three independent code changes wired into the existing publish pipeline: (1) `sales_channel_properties` forwarding from master to cloned product in `createProductFromMaster`, (2) a pure `classifyStuckPublish` helper that replaces the silent 24h timeout in the reconcile cron with an unlocked+no-external detection, and (3) 429 retry loops with `Retry-After` in `printifyFetch` and `uploadEtsyListingImage`.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest (fake timers for sleep), Printify REST API, Etsy Open API v3.

---

## File Structure

**Modified:**
- `lib/printify/master-product.ts` — add `salesChannelProperties?: Record<string, unknown>` to `MasterProductSpec`; extract `sales_channel_properties` from API response
- `lib/printify/create-product.ts` — conditionally spread `sales_channel_properties` into POST body
- `lib/printify/get-product.ts` — add `isLocked: boolean` to return type (from `is_locked`)
- `lib/printify/client.ts` — add `sleep` + `retryDelay` helpers; add 429 retry loop before the existing 5xx retry
- `lib/mockups/upload-to-etsy.ts` — same `sleep` + `retryDelay` helpers; add 429 retry loop
- `app/api/cron/reconcile/route.ts` — import `classifyStuckPublish`; replace per-listing decision block with classify call; remove the now-unused `cutoff24h` variable

**Created:**
- `lib/publish/classify-stuck-publish.ts` — pure helper `classifyStuckPublish(opts) → 'live' | 'failed' | 'wait'`
- `tests/printify-master-product.test.ts` — tests for `fetchMasterProduct` `salesChannelProperties` extraction
- `tests/printify-get-product.test.ts` — tests for `getProduct` `isLocked` extraction
- `tests/classify-stuck-publish.test.ts` — truth table for `classifyStuckPublish`

**Extended (tests):**
- `tests/printify-create-product.test.ts` — 2 new tests: SCP included when present; omitted when absent
- `tests/printify-client.test.ts` — 3 new tests: 429+Retry-After succeeds, exponential fallback, 3×429 throws
- `tests/etsy-upload-image.test.ts` — 2 new tests: 429 retries and succeeds, 3×429 throws EtsyUploadError

---

## Task 0: Verify Printify accepts `sales_channel_properties` on product creation (manual gate)

> **BLOCKING for Task 1 only.** This is a live-API check — Task 1 depends on the outcome. Tasks 2–6 are independent and can proceed regardless.

**Files:** none

- [ ] **Step 1: Inspect the current master product's `sales_channel_properties` field**

```bash
curl -s \
  -H "Authorization: Bearer $PRINTIFY_API_KEY" \
  "https://api.printify.com/v1/shops/$PRINTIFY_SHOP_ID/products/<your-master-product-id>.json" \
  | python3 -m json.tool | grep -A 10 sales_channel_properties
```

- [ ] **Step 2: Decide go/no-go**

  - Output is a non-null object (e.g. `{ "etsy": { "shipping_template_id": ..., "taxonomy_id": ... } }`) → **proceed to Task 1**
  - Output is `null` or the field is absent → **skip Task 1 entirely**; the plain master (§1 operator step) is sufficient without code changes; proceed directly to Task 2

---

## Task 1: Forward `sales_channel_properties` from master to clone (§2)

> **⚠️ Skip if Task 0 found SCP is null/absent on the master.**

**Files:**
- Modify: `lib/printify/master-product.ts`
- Modify: `lib/printify/create-product.ts`
- Create: `tests/printify-master-product.test.ts`
- Modify: `tests/printify-create-product.test.ts`

- [ ] **Step 1: Write failing tests for `fetchMasterProduct` SCP extraction**

Create `tests/printify-master-product.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '27519707'),
  shopPath: vi.fn((s: string) => `/shops/27519707${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { fetchMasterProduct } from '@/lib/printify/master-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

const baseResp = {
  id: 'p1',
  title: 'Test master',
  blueprint_id: 145,
  print_provider_id: 1,
  variants: [{ id: 1, price: 2000, is_enabled: true }],
  print_areas: [],
};

describe('fetchMasterProduct — salesChannelProperties', () => {
  it('extracts sales_channel_properties when present', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      ...baseResp,
      sales_channel_properties: { etsy: { shipping_template_id: 99, taxonomy_id: 42 } },
    });
    const spec = await fetchMasterProduct('p1');
    expect(spec.salesChannelProperties).toEqual({ etsy: { shipping_template_id: 99, taxonomy_id: 42 } });
  });

  it('sets salesChannelProperties to undefined when absent', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce(baseResp);
    const spec = await fetchMasterProduct('p1');
    expect(spec.salesChannelProperties).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/printify-master-product.test.ts
```

Expected: FAIL — `salesChannelProperties` does not exist on `MasterProductSpec`.

- [ ] **Step 3: Update `lib/printify/master-product.ts`**

Full replacement:

```typescript
import { printifyFetch, shopPath } from './client';

export type MasterPrintArea = {
  variantIds: number[];
  placeholders: Array<{
    position: string;
    images: Array<{
      id: string;
      x: number;
      y: number;
      scale: number;
      angle: number;
    }>;
  }>;
};

export type MasterProductSpec = {
  productId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  variants: Array<{ id: number; price: number; isEnabled: boolean }>;
  printAreas: MasterPrintArea[];
  thumbnailUrl: string | null;
  salesChannelProperties?: Record<string, unknown>;
};

type PrintifyProductResp = {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{ id: number; price: number; is_enabled?: boolean; is_default?: boolean }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images: Array<{ id: string; x: number; y: number; scale: number; angle: number }>;
    }>;
  }>;
  images?: Array<{ src: string; position?: string; is_default?: boolean }>;
  sales_channel_properties?: Record<string, unknown>;
};

export async function fetchMasterProduct(productId: string): Promise<MasterProductSpec> {
  const r = await printifyFetch<PrintifyProductResp>(shopPath(`/products/${productId}.json`));
  return {
    productId: r.id,
    title: r.title,
    blueprintId: r.blueprint_id,
    printProviderId: r.print_provider_id,
    variants: r.variants
      .filter((v) => v.is_enabled !== false)
      .map((v) => ({ id: v.id, price: v.price, isEnabled: v.is_enabled !== false })),
    printAreas: r.print_areas.map((pa) => ({
      variantIds: pa.variant_ids,
      placeholders: pa.placeholders.map((ph) => ({
        position: ph.position,
        images: ph.images,
      })),
    })),
    thumbnailUrl:
      r.images?.find((i) => i.is_default)?.src ??
      r.images?.find((i) => i.position === 'front')?.src ??
      r.images?.[0]?.src ??
      null,
    salesChannelProperties: r.sales_channel_properties,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/printify-master-product.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write failing tests for `createProductFromMaster` SCP forwarding**

Add to `tests/printify-create-product.test.ts` inside the `describe('createProductFromMaster')` block, after the existing two tests:

```typescript
  it('includes sales_channel_properties in POST body when master has it', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_scp' });
    await createProductFromMaster({
      master: {
        ...sampleMaster,
        salesChannelProperties: { etsy: { shipping_template_id: 12345, taxonomy_id: 1000 } },
      },
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      sales_channel_properties: { etsy: { shipping_template_id: 12345, taxonomy_id: 1000 } },
    });
  });

  it('omits sales_channel_properties when master has none', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({ id: 'prod_no_scp' });
    await createProductFromMaster({
      master: sampleMaster,
      imageId: 'img_new',
      title: 't',
      description: 'd',
      tags: [],
    });
    const body = (vi.mocked(printifyFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('sales_channel_properties');
  });
```

- [ ] **Step 6: Run to verify the 2 new tests fail (existing tests still pass)**

```bash
pnpm test tests/printify-create-product.test.ts
```

Expected: 2 existing tests PASS, 2 new tests FAIL.

- [ ] **Step 7: Update `lib/printify/create-product.ts` — add SCP spread after `print_areas`**

Change the `body` object to add the optional spread at the end. Replace the closing `};` of the `body` declaration with:

```typescript
  const body = {
    title: opts.title,
    description: opts.description,
    blueprint_id: master.blueprintId,
    print_provider_id: master.printProviderId,
    tags: opts.tags,
    variants: pricedVariants.map((v) => ({
      id: v.id,
      price: v.price,
      is_enabled: v.isEnabled,
    })),
    print_areas: master.printAreas.map((pa) => ({
      variant_ids: pa.variantIds,
      placeholders: pa.placeholders
        .filter((ph) => ph.images.length > 0)
        .map((ph) => ({
          position: ph.position,
          images: ph.images.map((img) => ({
            id: imageId,
            x: img.x,
            y: img.y,
            scale: img.scale,
            angle: img.angle,
          })),
        })),
    })),
    ...(master.salesChannelProperties && {
      sales_channel_properties: master.salesChannelProperties,
    }),
  };
```

- [ ] **Step 8: Run all four tests in the two files to verify they pass**

```bash
pnpm test tests/printify-master-product.test.ts tests/printify-create-product.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 9: Run the full suite to confirm no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/printify/master-product.ts lib/printify/create-product.ts tests/printify-master-product.test.ts tests/printify-create-product.test.ts
git commit -m "feat(publish): forward sales_channel_properties from master to cloned products"
```

---

## Task 2: Add `isLocked` to `getProduct` (§3)

**Files:**
- Modify: `lib/printify/get-product.ts`
- Create: `tests/printify-get-product.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/printify-get-product.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
  getShopId: vi.fn(() => '27519707'),
  shopPath: vi.fn((s: string) => `/shops/27519707${s}`),
}));

import { printifyFetch } from '@/lib/printify/client';
import { getProduct } from '@/lib/printify/get-product';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

describe('getProduct', () => {
  it('returns isLocked: true when product is_locked is true', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod1',
      title: 'test',
      visible: true,
      is_locked: true,
      external: null,
    });
    const r = await getProduct('prod1');
    expect(r.isLocked).toBe(true);
    expect(r.etsyListingId).toBeNull();
  });

  it('returns isLocked: false when is_locked is absent', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      id: 'prod2',
      title: 'test',
      visible: true,
      external: { id: 'etsy123', handle: 'https://etsy.com/listing/123' },
    });
    const r = await getProduct('prod2');
    expect(r.isLocked).toBe(false);
    expect(r.etsyListingId).toBe('etsy123');
    expect(r.etsyUrl).toBe('https://etsy.com/listing/123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/printify-get-product.test.ts
```

Expected: FAIL — `isLocked` is not on the return type.

- [ ] **Step 3: Update `lib/printify/get-product.ts`**

Full replacement:

```typescript
import { printifyFetch, shopPath } from './client';

type PrintifyProductResp = {
  id: string;
  title: string;
  visible?: boolean;
  is_locked?: boolean;
  external?: { id?: string; handle?: string } | null;
};

export async function getProduct(productId: string): Promise<{
  productId: string;
  etsyListingId: string | null;
  etsyUrl: string | null;
  visible: boolean;
  isLocked: boolean;
}> {
  const r = await printifyFetch<PrintifyProductResp>(shopPath(`/products/${productId}.json`));
  return {
    productId: r.id,
    etsyListingId: r.external?.id ?? null,
    etsyUrl: r.external?.handle ?? null,
    visible: r.visible ?? false,
    isLocked: r.is_locked ?? false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/printify-get-product.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/printify/get-product.ts tests/printify-get-product.test.ts
git commit -m "feat(publish): expose isLocked from Printify product GET"
```

---

## Task 3: Pure `classifyStuckPublish` helper (§3)

**Files:**
- Create: `lib/publish/classify-stuck-publish.ts`
- Create: `tests/classify-stuck-publish.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/classify-stuck-publish.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyStuckPublish } from '@/lib/publish/classify-stuck-publish';

const ONE_HOUR = 60 * 60 * 1000;

describe('classifyStuckPublish', () => {
  it('returns live when hasExternal is true, regardless of lock or age', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: true, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('live');
    expect(classifyStuckPublish({ isLocked: true,  hasExternal: true, ageMs: 30 * 60 * 1000, cutoffMs: ONE_HOUR })).toBe('live');
  });

  it('returns wait when isLocked is true and no external (Printify still processing)', () => {
    expect(classifyStuckPublish({ isLocked: true, hasExternal: false, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('wait');
  });

  it('returns failed when unlocked + no external + ageMs >= cutoffMs', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: ONE_HOUR,     cutoffMs: ONE_HOUR })).toBe('failed');
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('failed');
  });

  it('returns wait when unlocked + no external + ageMs < cutoffMs (too early to conclude)', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: ONE_HOUR - 1, cutoffMs: ONE_HOUR })).toBe('wait');
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: 0,            cutoffMs: ONE_HOUR })).toBe('wait');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/classify-stuck-publish.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `lib/publish/classify-stuck-publish.ts`**

```typescript
export type StuckPublishDecision = 'live' | 'failed' | 'wait';

export function classifyStuckPublish(opts: {
  isLocked: boolean;
  hasExternal: boolean;
  ageMs: number;
  cutoffMs: number;
}): StuckPublishDecision {
  if (opts.hasExternal) return 'live';
  if (opts.isLocked) return 'wait';
  if (opts.ageMs >= opts.cutoffMs) return 'failed';
  return 'wait';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/classify-stuck-publish.test.ts
```

Expected: all 4 test cases PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/publish/classify-stuck-publish.ts tests/classify-stuck-publish.test.ts
git commit -m "feat(publish): add classifyStuckPublish pure helper"
```

---

## Task 4: Wire `classifyStuckPublish` into the reconcile cron (§3)

**Files:**
- Modify: `app/api/cron/reconcile/route.ts`

This task has no new tests because the decision logic is fully covered by Task 3. The cron wiring is a straightforward substitution of the old `if (etsyListingId) ... else if (createdAt < cutoff24h)` block.

- [ ] **Step 1: Replace `app/api/cron/reconcile/route.ts` with the updated version**

Full replacement:

```typescript
import { NextResponse } from 'next/server';
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { getProduct } from '@/lib/printify/get-product';
import { PrintifyError } from '@/lib/printify/client';
import { logEvent } from '@/lib/events';
import { processListingPhotos } from '@/lib/mockups/process-listing';
import { classifyStuckPublish } from '@/lib/publish/classify-stuck-publish';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cutoff1h = new Date(Date.now() - 60 * 60 * 1000);

  const stuck = await db
    .select()
    .from(listings)
    .where(
      and(
        or(eq(listings.status, 'publishing'), eq(listings.status, 'publishing_slow')),
        lt(listings.createdAt, cutoff1h),
      ),
    );

  let reconciled = 0;
  let failed = 0;

  for (const l of stuck) {
    if (!l.printifyProductId) continue;
    try {
      const status = await getProduct(l.printifyProductId);
      const decision = classifyStuckPublish({
        isLocked: status.isLocked,
        hasExternal: !!(status.etsyListingId && status.etsyUrl),
        ageMs: Date.now() - new Date(l.createdAt).getTime(),
        cutoffMs: 60 * 60 * 1000,
      });

      if (decision === 'live') {
        await db
          .update(listings)
          .set({ etsyListingId: status.etsyListingId, status: 'live', publishedAt: new Date() })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'live' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'published',
          designId: l.designId,
          payload: { reconciled: true, etsyListingId: status.etsyListingId },
        });
        reconciled++;
      } else if (decision === 'failed') {
        await db
          .update(listings)
          .set({
            status: 'failed',
            failureReason:
              'Printify accepted the publish but no Etsy listing was created — check the Printify dashboard.',
          })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'publish_failed',
          designId: l.designId,
          payload: { reconcile: true, reason: 'unlocked_no_external' },
        });
        failed++;
      }
      // decision === 'wait' → Printify still processing; check again next cron run
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await logEvent({
        type: 'publish_failed',
        designId: l.designId,
        payload: { reconcile: true, reason: reason.slice(0, 500) },
      });
    }
  }

  // External-deletion check: any live listing whose Printify product no
  // longer exists (404) gets flipped to 'failed'. Common cause: operator
  // deleted the product in Printify or unpublished it from Etsy directly.
  const liveListings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.status, 'live'), isNotNull(listings.printifyProductId)));

  let externallyDeleted = 0;
  for (const l of liveListings) {
    if (!l.printifyProductId) continue;
    try {
      await getProduct(l.printifyProductId);
    } catch (err) {
      if (err instanceof PrintifyError && err.status === 404) {
        await db
          .update(listings)
          .set({ status: 'failed', failureReason: 'Removed from Printify externally' })
          .where(eq(listings.id, l.id));
        await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, l.designId));
        await logEvent({
          type: 'publish_failed',
          designId: l.designId,
          payload: { kind: 'external_delete', source: 'printify_404' },
        });
        externallyDeleted++;
      }
      // Other errors (5xx, network) — leave as live, will retry next cron.
    }
  }

  // Photos backfill pass — any live listing without photos, < 7 days old.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendingPhotos = await db
    .select()
    .from(listings)
    .where(and(
      eq(listings.status, 'live'),
      isNotNull(listings.etsyListingId),
      isNull(listings.photosUploadedAt),
      gt(listings.createdAt, sevenDaysAgo),
    ));

  let photosUploaded = 0;
  let photosSkipped = 0;
  for (const l of pendingPhotos) {
    try {
      const r = await processListingPhotos(l.id);
      if (r.ok) {
        photosUploaded++;
      } else if (r.errorCode === 'NOT_CONNECTED' || r.errorCode === 'AUTH_EXPIRED') {
        photosSkipped++;
        break;
      } else {
        photosSkipped++;
      }
    } catch {
      photosSkipped++;
    }
  }

  await logEvent({
    type: 'generated',
    payload: {
      kind: 'reconcile_run',
      scanned: stuck.length,
      reconciled,
      failed,
      externallyDeleted,
      photosUploaded,
      photosSkipped,
    },
  });

  return NextResponse.json({
    ok: true,
    scanned: stuck.length,
    reconciled,
    failed,
    externallyDeleted,
    photosUploaded,
    photosSkipped,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | head -40
```

Expected: no TypeScript errors related to `classifyStuckPublish` or `isLocked`.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/reconcile/route.ts
git commit -m "feat(publish): reconcile cron surfaces unlocked+no-external publishes as failed"
```

---

## Task 5: 429 backoff in `printifyFetch` (§4)

**Files:**
- Modify: `lib/printify/client.ts`
- Modify: `tests/printify-client.test.ts`

- [ ] **Step 1: Write 3 failing 429 tests**

Add the following tests to `tests/printify-client.test.ts` inside the existing `describe('printifyFetch', () => {` block, after the last test:

```typescript
  it('retries on 429 with Retry-After header and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const promise = printifyFetch<{ ok: boolean }>('/x');
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on 429 without Retry-After using exponential delays and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const promise = printifyFetch<{ ok: boolean }>('/x');
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('throws PrintifyError after exhausting 3 retries all returning 429', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const promise = printifyFetch('/x');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ status: 429 });
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run to verify the 3 new tests fail (existing 5 still pass)**

```bash
pnpm test tests/printify-client.test.ts
```

Expected: 5 existing tests PASS, 3 new tests FAIL.

- [ ] **Step 3: Replace `lib/printify/client.ts` with the updated version**

```typescript
const PRINTIFY_BASE = 'https://api.printify.com/v1';

export class PrintifyError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
    this.name = 'PrintifyError';
  }
}

export function getShopId(): string {
  const id = process.env.PRINTIFY_SHOP_ID;
  if (!id) throw new Error('PRINTIFY_SHOP_ID not set');
  return id;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const sec = parseInt(retryAfterHeader, 10);
    return Number.isFinite(sec) ? Math.min(sec * 1000, 10_000) : 1_000;
  }
  return Math.min(1_000 * Math.pow(2, attempt), 10_000);
}

export async function printifyFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const key = process.env.PRINTIFY_API_KEY;
  if (!key) throw new Error('PRINTIFY_API_KEY not set');

  let url = `${PRINTIFY_BASE}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    url += url.includes('?') ? `&${qs}` : `?${qs}`;
  }

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'User-Agent': 'tshirt-generator/0.1 (eugene.vestel@gmail.com)',
      'content-type': 'application/json;charset=utf-8',
    },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let resp = await fetch(url, init);

  for (let attempt = 0; attempt < 3 && resp.status === 429; attempt++) {
    await sleep(retryDelay(attempt, resp.headers.get('Retry-After')));
    resp = await fetch(url, init);
  }

  if (resp.status >= 500 && resp.status < 600) {
    resp = await fetch(url, init);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const excerpt = body.length > 0 ? ` — ${body.slice(0, 400)}` : '';
    throw new PrintifyError(resp.status, body, `Printify ${opts.method ?? 'GET'} ${path} failed: ${resp.status}${excerpt}`);
  }
  return (await resp.json()) as T;
}

export function shopPath(suffix: string): string {
  return `/shops/${getShopId()}${suffix}`;
}
```

- [ ] **Step 4: Run tests to verify all 8 pass**

```bash
pnpm test tests/printify-client.test.ts
```

Expected: all 8 tests PASS (5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/printify/client.ts tests/printify-client.test.ts
git commit -m "feat(publish): 429 Retry-After backoff in printifyFetch (max 3 retries, 10 s cap)"
```

---

## Task 6: 429 backoff in `uploadEtsyListingImage` (§4)

**Files:**
- Modify: `lib/mockups/upload-to-etsy.ts`
- Modify: `tests/etsy-upload-image.test.ts`

- [ ] **Step 1: Write 2 failing 429 tests**

Add the following tests to `tests/etsy-upload-image.test.ts` inside the existing `describe('uploadEtsyListingImage', () => {` block, after the last test:

```typescript
  it('retries on 429 with Retry-After header and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ listing_image_id: 9999, url_fullxfull: 'https://img.etsy/x' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const promise = uploadEtsyListingImage({
      accessToken: 't', shopId: 1, listingId: '1',
      imageBuffer: Buffer.from('x'), filename: 'x.jpg', rank: 1, altText: 'x',
    });
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.listingImageId).toBe(9999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws EtsyUploadError after exhausting 3 retries all returning 429', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const promise = uploadEtsyListingImage({
      accessToken: 't', shopId: 1, listingId: '1',
      imageBuffer: Buffer.from('x'), filename: 'x.jpg', rank: 1, altText: 'x',
    });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ name: 'EtsyUploadError', status: 429 });
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run to verify the 2 new tests fail (existing 2 still pass)**

```bash
pnpm test tests/etsy-upload-image.test.ts
```

Expected: 2 existing tests PASS, 2 new tests FAIL.

- [ ] **Step 3: Replace `lib/mockups/upload-to-etsy.ts` with the updated version**

```typescript
import { EtsyUploadError } from '@/lib/etsy/errors';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const sec = parseInt(retryAfterHeader, 10);
    return Number.isFinite(sec) ? Math.min(sec * 1000, 10_000) : 1_000;
  }
  return Math.min(1_000 * Math.pow(2, attempt), 10_000);
}

export async function uploadEtsyListingImage(opts: {
  accessToken: string;
  shopId: number;
  listingId: string;
  imageBuffer: Buffer;
  filename: string;
  rank: number;
  altText: string;
}): Promise<{ listingImageId: number; url: string }> {
  const apiKey = process.env.ETSY_API_KEY;
  const sharedSecret = process.env.ETSY_SHARED_SECRET;
  if (!apiKey || !sharedSecret) throw new Error('ETSY_API_KEY / ETSY_SHARED_SECRET not set');

  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(opts.imageBuffer)], { type: 'image/jpeg' }), opts.filename);
  form.append('rank', String(opts.rank));
  form.append('alt_text', opts.altText);
  form.append('overwrite', 'false');

  const url = `https://openapi.etsy.com/v3/application/shops/${opts.shopId}/listings/${opts.listingId}/images`;
  const reqInit: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'x-api-key': `${apiKey}:${sharedSecret}`,
    },
    body: form,
  };

  let resp = await fetch(url, reqInit);

  for (let attempt = 0; attempt < 3 && resp.status === 429; attempt++) {
    await sleep(retryDelay(attempt, resp.headers.get('Retry-After')));
    resp = await fetch(url, reqInit);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new EtsyUploadError(resp.status, body);
  }
  const json = (await resp.json()) as { listing_image_id: number; url_fullxfull?: string; url_570xN?: string };
  return {
    listingImageId: json.listing_image_id,
    url: json.url_fullxfull ?? json.url_570xN ?? '',
  };
}
```

- [ ] **Step 4: Run tests to verify all 4 pass**

```bash
pnpm test tests/etsy-upload-image.test.ts
```

Expected: all 4 tests PASS (2 existing + 2 new).

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/mockups/upload-to-etsy.ts tests/etsy-upload-image.test.ts
git commit -m "feat(publish): 429 Retry-After backoff in uploadEtsyListingImage (max 3 retries)"
```

---

## After all tasks: E2E smoke test

Once a clean plain Printify master is selected in `/settings` (§1 operator step):

1. Paste one design in the bulk generator → approve → open publish modal → publish
2. Confirm the resulting Etsy listing is live with full colors/sizes and mockups
3. If it reaches `live` → run "Publish all" for the remaining designs
4. Wait for the next reconcile cron run (daily at 06:00 UTC) — any stuck publishes should now flip to `failed` with a human-readable reason in the `/listings` UI, not stay `publishing_slow` forever
