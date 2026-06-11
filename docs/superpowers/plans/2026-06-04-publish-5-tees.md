# Publish 5 Best-Seller Tees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish 5 best-seller text tees end-to-end through the existing Printify→Etsy pipeline today, with accurate garment copy, and add a repeatable "Publish all" batch action so 20/100 are the same few clicks.

**Architecture:** Reuse the existing, tested endpoints (`draft-listing`, `/api/listings` with server-side dynamic pricing, `photos` top-up). Phase 0 is a live one-shot smoke test to de-risk. Phase 1 derives the garment/material line from the master product's blueprint and removes the hardcoded "Bella+Canvas 3001" claim. Phase 2 adds a pure orchestration function (`publishApprovedDesigns`) driven by a thin client component on the review grid.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle/Postgres, Vitest, Printify + Etsy REST, Gemini/Groq.

---

## File Structure

- `lib/printify/garment-descriptor.ts` (new) — resolve a human-readable garment name from a blueprint id.
- `lib/ai/listing-copy.ts` (modify) — accept an optional `garment`; build the system prompt from it.
- `app/api/designs/[id]/draft-listing/route.ts` (modify) — resolve garment from the master product and pass it.
- `lib/publish/publish-batch.ts` (new) — pure, dependency-injected batch orchestrator.
- `app/(app)/batches/[id]/batch-publish.tsx` (new) — client component: button + progress, wires real fetch deps.
- `app/(app)/batches/[id]/review-grid.tsx` (modify) — render `<BatchPublish>`.
- Tests: `tests/garment-descriptor.test.ts`, `tests/listing-copy-garment.test.ts`, `tests/publish-batch.test.ts`.

---

## Task 0: Phase 0 — Verify ONE publish end-to-end (operational gate, no code)

**Purpose:** Prove the live pipeline transfers colors/sizes/prices/mockups before writing automation. This listing becomes the first of the 5.

- [ ] **Step 1: Confirm preconditions**

Verify in `/settings` (live site, password `tshirts`): master product selected, Etsy connected, **daily publish cap ≥ 5**.

- [ ] **Step 2: Create one design via the canvas path**

On the live site `/batches/new` → "Paste list" tab: paste **one** curated best-seller quote, pick font/size/color/template, render, and submit (uploads PNG to Blob → `POST /api/bulk-batches`). Driven via the Playwright browser tool.

- [ ] **Step 3: Publish it**

Open the resulting `/batches/[id]`, approve the design, and publish via the modal (draft copy → dynamic price → Publish to Etsy). Let the photo top-up run.

- [ ] **Step 4: Inspect and record results**

Open the live Etsy listing + the Printify product and check each box:
- [ ] all master variant **colors** present
- [ ] all master **sizes** present
- [ ] **per-variant prices** correct; dynamic base applied
- [ ] **all mockups** on Etsy (1 auto + top-up)
- [ ] title front-loaded, **exactly 13 tags**, 3-paragraph description

- [ ] **Step 5: Decide**

If all pass → proceed to Task 1. If any fail → STOP, report the failure, and amend this plan with a fix task before continuing. (Failure specifics are unknown until run; do not write speculative fix tasks now.)

---

## Task 1: Garment descriptor helper

**Files:**
- Create: `lib/printify/garment-descriptor.ts`
- Test: `tests/garment-descriptor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/garment-descriptor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/printify/catalog', () => ({
  fetchBlueprintDetail: vi.fn(),
}));

import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { fetchBlueprintDetail } from '@/lib/printify/catalog';

describe('getGarmentDescriptor', () => {
  beforeEach(() => vi.mocked(fetchBlueprintDetail).mockReset());

  it('returns "brand model" when both are present', async () => {
    vi.mocked(fetchBlueprintDetail).mockResolvedValue({
      id: 6, title: 'Unisex Jersey Short Sleeve Tee', brand: 'Bella+Canvas', model: '3001', images: [],
    });
    expect(await getGarmentDescriptor(6)).toBe('Bella+Canvas 3001');
  });

  it('falls back to the title when brand/model are missing', async () => {
    vi.mocked(fetchBlueprintDetail).mockResolvedValue({
      id: 9, title: 'Heavy Cotton Tee', images: [],
    });
    expect(await getGarmentDescriptor(9)).toBe('Heavy Cotton Tee');
  });

  it('returns null on fetch failure (caller applies its own default)', async () => {
    vi.mocked(fetchBlueprintDetail).mockRejectedValue(new Error('boom'));
    expect(await getGarmentDescriptor(6)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/garment-descriptor.test.ts`
Expected: FAIL — cannot find module `@/lib/printify/garment-descriptor`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/printify/garment-descriptor.ts
import { fetchBlueprintDetail } from './catalog';

/** Human-readable garment identity for listing copy, derived from a master
 *  product's blueprint (brand + model, e.g. "Bella+Canvas 3001"). Falls back to
 *  the blueprint title. Returns null on failure so the copy generator can apply
 *  its own safe default. */
export async function getGarmentDescriptor(blueprintId: number): Promise<string | null> {
  try {
    const bp = await fetchBlueprintDetail(blueprintId);
    const brandModel = [bp.brand, bp.model].filter(Boolean).join(' ').trim();
    if (brandModel) return brandModel;
    if (bp.title?.trim()) return bp.title.trim();
  } catch {
    /* fall through to null */
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/garment-descriptor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/printify/garment-descriptor.ts tests/garment-descriptor.test.ts
git commit -m "listings: derive garment name from master blueprint"
```

---

## Task 2: Thread garment into the copy generator

**Files:**
- Modify: `lib/ai/listing-copy.ts`
- Test: `tests/listing-copy-garment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/listing-copy-garment.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystem, fallbackDraft, DEFAULT_GARMENT } from '@/lib/ai/listing-copy';

describe('garment in copy', () => {
  it('buildSystem injects the given garment into paragraph 2', () => {
    const sys = buildSystem('Gildan 5000');
    expect(sys).toContain('Gildan 5000');
    expect(sys).not.toContain('Bella+Canvas 3001');
  });

  it('buildSystem uses the default garment when none is given via fallback', () => {
    expect(DEFAULT_GARMENT).toContain('Bella+Canvas 3001');
    expect(buildSystem(DEFAULT_GARMENT)).toContain('Bella+Canvas 3001');
  });

  it('fallbackDraft description uses the provided garment', () => {
    const d = fallbackDraft('Cat Mom Energy', 'Gildan 5000');
    expect(d.description).toContain('Gildan 5000');
  });

  it('fallbackDraft defaults the garment when omitted', () => {
    const d = fallbackDraft('Cat Mom Energy');
    expect(d.description).toContain('Bella+Canvas 3001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/listing-copy-garment.test.ts`
Expected: FAIL — `buildSystem` / `DEFAULT_GARMENT` not exported.

- [ ] **Step 3: Edit `lib/ai/listing-copy.ts`**

Replace the `const SYSTEM = \`...\`;` block with a builder + default, and update `draftListingCopy` and `fallbackDraft`.

Add near the top (after imports), replacing the existing `const SYSTEM = ...` declaration entirely:

```typescript
export const DEFAULT_GARMENT = '100% combed ring-spun cotton Bella+Canvas 3001';

export function buildSystem(garment: string): string {
  return `You write Etsy-optimized listing copy for print-on-demand t-shirts.

CONSTRAINTS:
- title: 5-140 chars. Start with the slogan or its rephrase, then high-intent keywords (Funny T-Shirt, Gift, Cute, etc.). Front-load value words. No <>{}[]| or ™®© symbols.
- tags: EXACTLY 13. Each 1-20 chars. All lowercase, letters/numbers/spaces only — NO punctuation, emojis, symbols. Mix: 4-5 short (1-2 word) high-volume tags, 6-7 medium (2-3 word) niche tags, 1-2 long-tail (3-5 word) phrases.
- description: 20-13000 chars. 2-3 paragraphs:
  - Para 1: hook the slogan, call out who it's for
  - Para 2: ${garment}, DTG print, runs true to size, unisex fit
  - Para 3: care + sizing chart pointer + gift-worthiness

Return JSON ONLY in this exact format:
{ "title": "...", "tags": ["...", "...", ...13 total], "description": "..." }

NO trademarks, NO celebrity names, NO copyrighted phrases.`;
}
```

Change the `draftListingCopy` signature and the `geminiJSON` call:

```typescript
export async function draftListingCopy(input: { slogan: string; garment?: string }): Promise<DraftResult> {
  const garment = input.garment?.trim() || DEFAULT_GARMENT;
  try {
    const { parsed, provider } = await geminiJSON<{ title?: unknown; tags?: unknown; description?: unknown }>({
      system: buildSystem(garment),
      user: `Slogan: ${input.slogan}`,
      model: MODEL,
      maxTokens: 2048,
    });
```

(The sanitize/validate block below it is unchanged, EXCEPT the fallback return line:)

```typescript
  } catch {
    /* fallthrough to fallback */
  }
  return { ...fallbackDraft(input.slogan, garment), source: 'fallback' };
}
```

Change `fallbackDraft` to accept the garment:

```typescript
export function fallbackDraft(slogan: string, garment: string = DEFAULT_GARMENT): ListingCopy {
  const cleanSlogan = slogan.trim();
  const title = `${cleanSlogan} Funny T-Shirt Gift`.slice(0, 140);
  const tags = sanitizeTags([], cleanSlogan);
  const description = `${cleanSlogan} — a comfortable unisex tee printed on ${garment}. Made just for you. Available in multiple colors and sizes. Perfect gift for anyone who appreciates a good shirt.`;
  return { title, tags, description };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/listing-copy-garment.test.ts tests/listing-copy.test.ts`
Expected: PASS. (Existing `listing-copy.test.ts` mocks `geminiJSON`; the `system` value changing does not break it.)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/listing-copy.ts tests/listing-copy-garment.test.ts
git commit -m "listings: build copy prompt from a garment descriptor"
```

---

## Task 3: Resolve + pass garment in the draft-listing route

**Files:**
- Modify: `app/api/designs/[id]/draft-listing/route.ts`
- Test: `tests/draft-listing-garment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/draft-listing-garment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settingsFindFirst = vi.fn();
const designsFindFirst = vi.fn();
const dbUpdate = vi.fn(() => ({ set: () => ({ where: vi.fn() }) }));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      settings: { findFirst: (...a: unknown[]) => settingsFindFirst(...a) },
      designs: { findFirst: (...a: unknown[]) => designsFindFirst(...a) },
    },
    update: (...a: unknown[]) => dbUpdate(...a),
  },
}));
vi.mock('@/lib/printify/master-product', () => ({ fetchMasterProduct: vi.fn() }));
vi.mock('@/lib/printify/garment-descriptor', () => ({ getGarmentDescriptor: vi.fn() }));
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy: vi.fn() }));
vi.mock('@/lib/events', () => ({ logEvent: vi.fn() }));

import { POST } from '@/app/api/designs/[id]/draft-listing/route';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { draftListingCopy } from '@/lib/ai/listing-copy';

beforeEach(() => {
  vi.clearAllMocks();
  designsFindFirst.mockResolvedValue({ id: 'd1', batchId: 'b1', concept: { headline: 'Cat Mom Energy' }, listingDraft: null });
  settingsFindFirst.mockResolvedValue({ masterPrintifyProductId: 'p1' });
  vi.mocked(fetchMasterProduct).mockResolvedValue({ blueprintId: 6 } as never);
  vi.mocked(getGarmentDescriptor).mockResolvedValue('Bella+Canvas 3001');
  vi.mocked(draftListingCopy).mockResolvedValue({ title: 't', tags: [], description: 'd', source: 'gemini' } as never);
});

describe('draft-listing route garment resolution', () => {
  it('passes the resolved garment to draftListingCopy', async () => {
    const res = await POST(new Request('http://x/api/designs/d1/draft-listing', { method: 'POST' }), { params: Promise.resolve({ id: 'd1' }) });
    expect(res.status).toBe(200);
    expect(draftListingCopy).toHaveBeenCalledWith({ slogan: 'Cat Mom Energy', garment: 'Bella+Canvas 3001' });
  });

  it('still drafts (garment undefined) when master lookup throws', async () => {
    vi.mocked(fetchMasterProduct).mockRejectedValue(new Error('printify down'));
    await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'd1' }) });
    expect(draftListingCopy).toHaveBeenCalledWith({ slogan: 'Cat Mom Energy', garment: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/draft-listing-garment.test.ts`
Expected: FAIL — route does not yet resolve/pass garment.

- [ ] **Step 3: Edit the route**

Add imports:

```typescript
import { settings } from '@/lib/db/schema';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
```

(`settings` import only needed if referenced; the query uses `db.query.settings` so the table import is not strictly required — omit it if `designs` is the only table referenced. Keep imports to what is used.)

Replace the draft line:

```typescript
  const slogan = (design.concept as Concept).headline;

  // Derive the garment/material line from the master product's blueprint so the
  // description is accurate. Non-blocking: any failure leaves garment undefined
  // and the generator applies its safe default.
  let garment: string | undefined;
  try {
    const s = await db.query.settings.findFirst();
    if (s?.masterPrintifyProductId) {
      const master = await fetchMasterProduct(s.masterPrintifyProductId);
      garment = (await getGarmentDescriptor(master.blueprintId)) ?? undefined;
    }
  } catch {
    /* non-blocking — default garment used */
  }

  const draft = await draftListingCopy({ slogan, garment });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test tests/draft-listing-garment.test.ts && npx tsc --noEmit 2>&1 | grep "draft-listing/route" || echo "no TS errors in route"`
Expected: tests PASS; no TS errors in the route.

- [ ] **Step 5: Commit**

```bash
git add "app/api/designs/[id]/draft-listing/route.ts" tests/draft-listing-garment.test.ts
git commit -m "listings: draft route resolves garment from master product"
```

---

## Task 4: Batch publish orchestrator (pure logic)

**Files:**
- Create: `lib/publish/publish-batch.ts`
- Test: `tests/publish-batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/publish-batch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { publishApprovedDesigns, type PublishBatchDeps } from '@/lib/publish/publish-batch';

const copy = { title: 't', tags: [], description: 'd' };

function deps(over: Partial<PublishBatchDeps> = {}): PublishBatchDeps {
  return {
    draft: vi.fn(async () => ({ ok: true, draft: copy })),
    publish: vi.fn(async () => ({ ok: true, status: 'live' as const, listingId: 'L1' })),
    uploadPhotos: vi.fn(async () => ({ ok: true })),
    onProgress: vi.fn(),
    ...over,
  };
}

describe('publishApprovedDesigns', () => {
  it('publishes all and uploads photos on the happy path', async () => {
    const d = deps();
    const r = await publishApprovedDesigns(['a', 'b'], d);
    expect(r).toMatchObject({ published: 2, failed: 0, queued: 0, stoppedAtCap: false });
    expect(d.uploadPhotos).toHaveBeenCalledTimes(2);
  });

  it('continues past a draft failure', async () => {
    const draft = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'gemini down' })
      .mockResolvedValueOnce({ ok: true, draft: copy });
    const r = await publishApprovedDesigns(['a', 'b'], deps({ draft }));
    expect(r).toMatchObject({ published: 1, failed: 1 });
  });

  it('stops and skips the rest when the cap is reached', async () => {
    const publish = vi.fn(async () => ({ ok: false, capReached: true }));
    const r = await publishApprovedDesigns(['a', 'b', 'c'], deps({ publish }));
    expect(r).toMatchObject({ published: 0, skipped: 3, stoppedAtCap: true });
  });

  it('marks slow publishes as queued and does NOT upload photos', async () => {
    const publish = vi.fn(async () => ({ ok: true, status: 'publishing_slow' as const }));
    const up = vi.fn(async () => ({ ok: true }));
    const r = await publishApprovedDesigns(['a'], deps({ publish, uploadPhotos: up }));
    expect(r).toMatchObject({ queued: 1, published: 0 });
    expect(up).not.toHaveBeenCalled();
  });

  it('counts a live listing as published even if photo upload fails', async () => {
    const up = vi.fn(async () => ({ ok: false, error: 'etsy 500' }));
    const r = await publishApprovedDesigns(['a'], deps({ uploadPhotos: up }));
    expect(r).toMatchObject({ published: 1, failed: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/publish-batch.test.ts`
Expected: FAIL — cannot find module `@/lib/publish/publish-batch`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/publish/publish-batch.ts
import type { ListingCopy } from '@/lib/etsy/validators';

export type BatchItemStatus =
  | 'pending' | 'drafting' | 'publishing' | 'photos' | 'live' | 'queued' | 'failed' | 'skipped';

export type BatchProgressEvent = { designId: string; status: BatchItemStatus; error?: string };

export type PublishBatchDeps = {
  draft: (designId: string) => Promise<{ ok: boolean; draft?: ListingCopy; error?: string }>;
  publish: (
    designId: string,
    copy: ListingCopy,
  ) => Promise<{
    ok: boolean;
    status?: 'live' | 'publishing_slow';
    listingId?: string;
    capReached?: boolean;
    error?: string;
  }>;
  uploadPhotos: (listingId: string) => Promise<{ ok: boolean; error?: string }>;
  onProgress: (e: BatchProgressEvent) => void;
};

export type PublishBatchResult = {
  published: number;
  queued: number;
  failed: number;
  skipped: number;
  stoppedAtCap: boolean;
};

// Sequentially draft → publish → photo-top-up each design. Reuses the same
// endpoints the publish modal uses, one at a time. Continues past per-design
// failures; stops cleanly when the server reports the daily publish cap.
export async function publishApprovedDesigns(
  designIds: string[],
  deps: PublishBatchDeps,
): Promise<PublishBatchResult> {
  const result: PublishBatchResult = { published: 0, queued: 0, failed: 0, skipped: 0, stoppedAtCap: false };

  for (const id of designIds) {
    if (result.stoppedAtCap) {
      deps.onProgress({ designId: id, status: 'skipped' });
      result.skipped++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'drafting' });
    const d = await deps.draft(id);
    if (!d.ok || !d.draft) {
      deps.onProgress({ designId: id, status: 'failed', error: d.error ?? 'draft failed' });
      result.failed++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'publishing' });
    const p = await deps.publish(id, d.draft);
    if (p.capReached) {
      result.stoppedAtCap = true;
      deps.onProgress({ designId: id, status: 'skipped', error: 'daily publish cap reached' });
      result.skipped++;
      continue;
    }
    if (!p.ok) {
      deps.onProgress({ designId: id, status: 'failed', error: p.error ?? 'publish failed' });
      result.failed++;
      continue;
    }
    if (p.status === 'publishing_slow' || !p.listingId) {
      deps.onProgress({ designId: id, status: 'queued' });
      result.queued++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'photos' });
    const ph = await deps.uploadPhotos(p.listingId);
    if (!ph.ok) {
      // Listing is live; only the extra photos failed (cron backfills). Count it.
      deps.onProgress({ designId: id, status: 'live', error: ph.error ?? 'photos pending (cron retries)' });
      result.published++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'live' });
    result.published++;
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/publish-batch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/publish/publish-batch.ts tests/publish-batch.test.ts
git commit -m "publish: add cap-aware batch orchestrator (pure logic)"
```

---

## Task 5: Batch publish UI + wire into review grid

**Files:**
- Create: `app/(app)/batches/[id]/batch-publish.tsx`
- Modify: `app/(app)/batches/[id]/review-grid.tsx`

- [ ] **Step 1: Create the client component**

```tsx
// app/(app)/batches/[id]/batch-publish.tsx
'use client';

import { useState } from 'react';
import type { Design } from '@/lib/db/schema';
import type { ListingCopy } from '@/lib/etsy/validators';
import { publishApprovedDesigns, type BatchItemStatus } from '@/lib/publish/publish-batch';

const LABELS: Record<BatchItemStatus, string> = {
  pending: 'Pending', drafting: 'Drafting copy…', publishing: 'Publishing…',
  photos: 'Uploading photos…', live: '✓ Live', queued: '⏳ Queued',
  failed: '✕ Failed', skipped: '— Skipped',
};

export function BatchPublish({ designs, onDone }: { designs: Design[]; onDone: () => void }) {
  const publishable = designs.filter((d) => d.status === 'pending_review' || d.status === 'approved');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, { status: BatchItemStatus; error?: string }>>({});
  const [summary, setSummary] = useState('');

  async function run() {
    if (!confirm(`Publish ${publishable.length} design(s) to Etsy? Each clones your master product and uploads mockups.`)) return;
    setRunning(true);
    setSummary('');
    const res = await publishApprovedDesigns(
      publishable.map((d) => d.id),
      {
        draft: async (id) => {
          const r = await fetch(`/api/designs/${id}/draft-listing`, { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          return { ok: !!j.ok, draft: j.draft as ListingCopy | undefined, error: j.error };
        },
        publish: async (id, copy) => {
          const r = await fetch('/api/listings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ design_id: id, title: copy.title, tags: copy.tags, description: copy.description }),
          });
          const j = await r.json().catch(() => ({}));
          return {
            ok: r.ok && !!j.ok,
            status: j.status,
            listingId: j.listingId,
            capReached: r.status === 429,
            error: j.error,
          };
        },
        uploadPhotos: async (listingId) => {
          const r = await fetch(`/api/listings/${listingId}/photos`, { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          return { ok: r.ok && !!j.ok, error: j.error };
        },
        onProgress: (e) => setProgress((prev) => ({ ...prev, [e.designId]: { status: e.status, error: e.error } })),
      },
    );
    setSummary(
      `Published ${res.published}, queued ${res.queued}, failed ${res.failed}` +
        (res.stoppedAtCap ? `, skipped ${res.skipped} (daily cap reached — raise it in /settings)` : ''),
    );
    setRunning(false);
    onDone();
  }

  if (publishable.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Batch publish</span>
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {running ? 'Publishing…' : `Publish all (${publishable.length})`}
        </button>
      </div>
      {Object.keys(progress).length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
          {publishable.map((d) => {
            const p = progress[d.id];
            return (
              <li key={d.id} className="flex justify-between">
                <span className="truncate">{(d.concept as { headline?: string })?.headline ?? d.id}</span>
                <span className={p?.status === 'failed' ? 'text-red-600' : p?.status === 'live' ? 'text-emerald-600' : ''}>
                  {p ? LABELS[p.status] : LABELS.pending}{p?.error ? ` — ${p.error}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {summary && <p className="mt-2 text-xs font-medium">{summary}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the review grid**

In `app/(app)/batches/[id]/review-grid.tsx`, add the import:

```tsx
import { BatchPublish } from './batch-publish';
```

And render it directly above the design grid `<div className="grid ...">` (inside the outer `<div className="space-y-4">`):

```tsx
      <BatchPublish designs={designs} onDone={refresh} />
```

- [ ] **Step 3: Typecheck + lint the new/changed files**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "batch-publish|review-grid" || echo "no TS errors"
npx eslint "app/(app)/batches/[id]/batch-publish.tsx" "app/(app)/batches/[id]/review-grid.tsx" 2>&1 | grep -E "error" | grep -vE "set-state-in-effect|Calling setState" || echo "no new lint errors"
```
Expected: no TS errors; no new lint errors.

- [ ] **Step 4: Full test + build**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/batches/[id]/batch-publish.tsx" "app/(app)/batches/[id]/review-grid.tsx"
git commit -m "ui: Publish all batch action on the review grid"
```

---

## Task 6: Deploy + run the batch to reach 5 live (operational)

**Files:** none (operational).

- [ ] **Step 1: Deploy**

Run: `vercel --prod --yes`
Expected: deployment READY, aliased to `tshirt-generator-one.vercel.app`.

- [ ] **Step 2: Create the remaining 4 designs**

On the live site, paste **4 more** curated quotes via the canvas path (one batch), so the batch has the 4 not-yet-published designs (plus optionally re-use the Task 0 batch).

- [ ] **Step 3: Run "Publish all"**

On `/batches/[id]`, click **Publish all**. Watch progress: each design drafting → publishing → photos → ✓ Live.

- [ ] **Step 4: Verify 5 live**

Confirm on Etsy: 5 listings, each with full colors/sizes, dynamic pricing, all mockups, accurate garment copy. Record any failures (continue-on-failure means failures are listed in the summary).

- [ ] **Step 5: Note scale-up**

Confirm the same button works for a 20-design batch next time. For 100, open a follow-up to build a durable `publishBatch` Vercel Workflow (out of scope here).

---

## Self-Review Notes

- **Spec coverage:** Phase 0 → Task 0; material-from-master → Tasks 1–3; "Publish all" batch (cap-aware, continue-on-failure, reuses endpoints, auto-uses drafted copy) → Tasks 4–5; run-5 + scale note → Task 6; scale-to-100 workflow explicitly deferred.
- **Cap behavior:** `/api/listings` returns HTTP 429 when `dailyPublishCap` is hit; the UI dep maps `r.status === 429` → `capReached`, and the orchestrator stops + skips the rest.
- **Types:** `ListingCopy` (from `@/lib/etsy/validators`) flows draft → publish; `BatchItemStatus`/`PublishBatchDeps`/`PublishBatchResult` names are consistent across Task 4 and Task 5.
- **Risk:** Gemini free-tier rate limits during a 20-batch — Groq fallback already covers transient failures; drafts are cached per design so reruns don't re-burn budget.
