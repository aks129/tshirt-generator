'use client';

import { useEffect, useState } from 'react';
import type { Design } from '@/lib/db/schema';
import type { Concept } from '@/lib/schemas';
import type { ListingCopy } from '@/lib/etsy/validators';
import { checkSloganPatterns, checkTitlePatterns } from '@/lib/insights/patterns';

type Draft = ListingCopy & { source: 'gemini' | 'groq' | 'fallback' };
type ModalStatus =
  | 'loading_draft'
  | 'editing'
  | 'publishing'
  | 'live'
  | 'slow'
  | 'queued'
  | 'uploading_photos'
  | 'live_with_photos'
  | 'photos_failed'
  | 'failed'
  | 'blocked';

export function PublishModal({
  design,
  onClose,
  onPublished,
}: {
  design: Design;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [status, setStatus] = useState<ModalStatus>('loading_draft');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [originalDraft, setOriginalDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>('');
  const [safetyFlags, setSafetyFlags] = useState<string[]>([]);
  const [etsyUrl, setEtsyUrl] = useState<string>('');
  const [preflight, setPreflight] = useState<{
    ok: boolean;
    hardFailing: number;
    softFailing: number;
    checks: Array<{ id: string; severity: 'hard' | 'soft'; label: string; ok: boolean; detail?: string }>;
    recommendedPriceCents: number | null;
    marketMedianCents: number | null;
  } | null>(null);
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [priceRec, setPriceRec] = useState<null | {
    source: 'fresh' | 'cached' | 'stale' | 'unavailable';
    sampleCount: number;
    statistics: { min: number; median: number; max: number } | null;
    fetchedAt: string | null;
  }>(null);
  // Optional manual price override. When off, the server applies dynamic
  // pricing (competitive rec → master prices). When on, the operator's fixed
  // base price is sent and wins.
  const [overridePrice, setOverridePrice] = useState(false);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceFloorCents, setPriceFloorCents] = useState<number>(1499);
  const [priceRefreshing, setPriceRefreshing] = useState(false);

  const concept = design.concept as Concept;

  async function loadPriceRec(force = false) {
    try {
      const qs = force ? '?force=true' : '';
      const res = await fetch(`/api/designs/${design.id}/price-recommendation${qs}`, { method: 'POST' });
      const text = await res.text();
      if (!text) return;
      let json: { ok?: boolean; recommendedCents?: number; source?: string; sampleCount?: number; statistics?: { min: number; median: number; max: number } | null; fetchedAt?: string | null };
      try { json = JSON.parse(text); } catch { return; }
      if (!json.ok) return;
      setPriceRec({
        source: (json.source ?? 'unavailable') as 'fresh' | 'cached' | 'stale' | 'unavailable',
        sampleCount: json.sampleCount ?? 0,
        statistics: json.statistics ?? null,
        fetchedAt: json.fetchedAt ?? null,
      });
      if (typeof json.recommendedCents === 'number') setPriceCents(json.recommendedCents);
    } catch {
      /* silent — modal still usable without price rec */
    }
  }

  async function refreshPriceRec() {
    setPriceRefreshing(true);
    try {
      await loadPriceRec(true);
    } finally {
      setPriceRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchDraft() {
      try {
        const res = await fetch(`/api/designs/${design.id}/draft-listing`, { method: 'POST' });
        const text = await res.text();
        if (cancelled) return;
        if (!text) {
          setError(`Server returned empty response (${res.status}). The draft request may have timed out — try again.`);
          setStatus('failed');
          return;
        }
        let json: { ok?: boolean; draft?: Draft; error?: string };
        try { json = JSON.parse(text); } catch {
          setError(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
          setStatus('failed');
          return;
        }
        if (!res.ok || !json.ok || !json.draft) {
          setError(json.error || 'Failed to draft listing');
          setStatus('failed');
          return;
        }
        setDraft(json.draft);
        setOriginalDraft(json.draft);
        setStatus('editing');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('failed');
      }
    }

    async function fetchPreflight() {
      setPreflightRunning(true);
      try {
        const res = await fetch(`/api/designs/${design.id}/preflight`);
        const j = await res.json();
        if (cancelled) return;
        if (j.ok) setPreflight(j.report);
      } catch {
        /* silent — modal still works without preflight */
      } finally {
        if (!cancelled) setPreflightRunning(false);
      }
    }

    fetchDraft();
    loadPriceRec(false);
    fetchPreflight();
    fetch('/api/settings/floor')
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.floorCents) setPriceFloorCents(j.floorCents); })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // loadPriceRec is stable for a given design.id; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.id]);

  async function publish(override = false) {
    if (!draft) return;
    setStatus('publishing');
    setError('');
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          design_id: design.id,
          title: draft.title,
          tags: draft.tags,
          description: draft.description,
          override_safety: override,
          // When the operator overrides, send a fixed base price; otherwise
          // omit and let the server apply dynamic pricing from the master product.
          ...(overridePrice && priceCents !== null ? { price_cents: priceCents } : {}),
        }),
      });
      const text = await res.text();
      if (!text) {
        setError(
          `Server timed out (${res.status}). Publish may still be running — check /listings in 1–2 minutes.`,
        );
        setStatus('slow');
        return;
      }
      let json: {
        ok?: boolean;
        flags?: string[];
        error?: string;
        status?: string;
        etsyUrl?: string;
        listingId?: string;
      };
      try {
        json = JSON.parse(text);
      } catch {
        setError(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
        setStatus('failed');
        return;
      }
      if (res.status === 422 && json.flags) {
        setSafetyFlags(json.flags);
        setStatus('blocked');
        return;
      }
      if (!res.ok && !json.ok) {
        setError(json.error || `Publish failed (${res.status})`);
        setStatus('failed');
        return;
      }
      if (json.status === 'live') {
        setEtsyUrl(json.etsyUrl || '');
        setStatus('live');
        onPublished();
        if (json.listingId) {
          await uploadPhotos(json.listingId);
        }
        return;
      }
      if (json.status === 'publishing_slow' && json.listingId) {
        setStatus('slow');
        pollListing(json.listingId);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('failed');
    }
  }

  async function uploadPhotos(listingId: string) {
    setStatus('uploading_photos');
    try {
      const res = await fetch(`/api/listings/${listingId}/photos`, { method: 'POST' });
      const text = await res.text();
      if (!text) {
        setStatus('photos_failed');
        setError('Server timed out uploading photos. Will retry from /listings or via cron.');
        return;
      }
      const json: { ok?: boolean; uploadedCount?: number; error?: string } = JSON.parse(text);
      if (json.ok && json.uploadedCount && json.uploadedCount > 0) {
        setStatus('live_with_photos');
        return;
      }
      setStatus('photos_failed');
      setError(json.error || 'Photos failed to upload.');
    } catch (err) {
      setStatus('photos_failed');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pollListing(listingId: string) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const r = await fetch(`/api/listings/${listingId}`);
        const j = await r.json();
        if (j.ok && j.listing?.status === 'live') {
          setEtsyUrl(j.etsyUrl || '');
          setStatus('live');
          onPublished();
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    // 60s passed without Etsy returning an external_handle.
    // The Printify→Etsy publish queue is async and can take minutes-to-hours
    // when their backend is busy. We've created the product on Printify and
    // triggered publish; the daily reconcile cron will flip the listing to
    // live whenever Etsy actually receives it. Let the user move on.
    setStatus('queued');
    onPublished();
  }

  function updateField<K extends keyof ListingCopy>(field: K, value: ListingCopy[K]) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value } as Draft);
  }

  const titleLen = draft?.title.length ?? 0;
  const tagsValid = draft && draft.tags.length === 13 && draft.tags.every((t) => /^[a-z0-9 ]+$/.test(t) && t.length <= 20);
  // Price now comes from the master Printify product, so no client-side gating.
  // Hard preflight checks (master set, image present, master reachable) block
  // publish. Soft fails (color count, mockup curation, full tag set) warn but
  // don't gate. If preflight hasn't loaded yet, don't block — defensive.
  const preflightBlocks = preflight ? !preflight.ok : false;
  // Only gate on price when the operator has opted into a manual override.
  const priceOverrideValid = !overridePrice || (priceCents !== null && priceCents >= priceFloorCents);
  const canPublish =
    !!draft &&
    titleLen >= 5 &&
    titleLen <= 140 &&
    !!tagsValid &&
    draft.description.length >= 20 &&
    !preflightBlocks &&
    priceOverrideValid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-bold">
            {status === 'live_with_photos' ? '✓ Listed on Etsy with 7 photos' :
              status === 'live' ? '✓ Listed on Etsy' :
              status === 'uploading_photos' ? 'Uploading mockup photos…' :
              status === 'photos_failed' ? '⚠ Listed but photos failed' :
              status === 'queued' ? '⏳ Queued at Printify' :
              status === 'slow' ? 'Publishing…' :
              status === 'publishing' ? 'Publishing…' :
              status === 'loading_draft' ? 'Drafting listing copy…' :
              status === 'blocked' ? '⚠ Content blocked' :
              status === 'failed' ? '✕ Failed' : 'Draft Etsy listing'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Slogan: "{concept.headline}"</p>
        </div>

        <div className="px-6 py-4">
          {status === 'loading_draft' && <Spinner label="Asking Gemini for an SEO-optimized draft…" />}

          {status === 'editing' && draft && (
            <div className="space-y-4">
              <PreflightPanel preflight={preflight} running={preflightRunning} />
              <Field label={`Title (${titleLen}/140)`}>
                <input
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    titleLen > 140 ? 'border-red-500' : 'border-zinc-300'
                  }`}
                  value={draft.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  aria-label="Listing title"
                />
              </Field>
              <Field label={`Tags (${draft.tags.length}/13)`}>
                <TagsEditor tags={draft.tags} onChange={(t) => updateField('tags', t)} />
              </Field>
              <Field label="Description">
                <textarea
                  className="h-32 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={draft.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  aria-label="Listing description"
                />
              </Field>
              <Field label="Pricing">
                <div className="space-y-1.5">
                  {!overridePrice && (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      ✓ Dynamic pricing: per-variant prices from the master Printify product set in <a href="/settings" className="underline">/settings</a>, shifted to the AI competitive recommendation.
                    </p>
                  )}
                  {priceRec && priceRec.statistics && priceRec.source !== 'unavailable' && (
                    <p className={
                      priceRec.source === 'stale'
                        ? 'text-xs text-amber-700'
                        : 'text-xs text-zinc-500'
                    }>
                      Market reference{priceRec.source === 'stale' && ' (stale)'}: {priceRec.sampleCount} comps · median $
                      {(priceRec.statistics.median / 100).toFixed(2)} · range $
                      {(priceRec.statistics.min / 100).toFixed(2)}–$
                      {(priceRec.statistics.max / 100).toFixed(2)}
                    </p>
                  )}
                  {priceRec && priceRec.source === 'unavailable' && !overridePrice && (
                    <p className="text-xs text-amber-700">
                      ⚠ Couldn&apos;t fetch competitive data — keeping the master product&apos;s prices.
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={overridePrice}
                      onChange={(e) => setOverridePrice(e.target.checked)}
                    />
                    Override with a fixed base price
                  </label>
                  {overridePrice && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={priceFloorCents / 100}
                            className={`w-28 rounded-md border py-2 pl-5 pr-2 text-sm ${
                              priceCents !== null && priceCents < priceFloorCents ? 'border-red-500' : 'border-zinc-300'
                            }`}
                            value={priceCents !== null ? (priceCents / 100).toFixed(2) : ''}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (Number.isFinite(v)) setPriceCents(Math.round(v * 100));
                              else setPriceCents(null);
                            }}
                            aria-label="Price in dollars"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={priceRefreshing}
                          className="rounded-md border border-zinc-300 px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          onClick={refreshPriceRec}
                        >
                          {priceRefreshing ? '…' : '↻ Refresh competitive data'}
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Applied as the lowest variant price; the master&apos;s size upcharge curve is preserved.
                      </p>
                      {priceCents !== null && priceCents < priceFloorCents && (
                        <p className="text-[11px] text-red-600">
                          Below floor (${(priceFloorCents / 100).toFixed(2)}). Raise the price to publish.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Field>
              {draft.source === 'fallback' && (
                <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ AI was unavailable — using a basic fallback draft. Edit before publishing.
                </p>
              )}
              {draft.source === 'gemini' && (
                <p className="text-[11px] text-zinc-400">✓ Drafted by Gemini</p>
              )}
              {draft.source === 'groq' && (
                <p className="text-[11px] text-emerald-600">↻ Drafted by Groq (Gemini was unavailable)</p>
              )}

              <PatternHints slogan={concept.headline} title={draft.title} tags={draft.tags} />

            </div>
          )}

          {(status === 'publishing' || status === 'slow') && (
            <div className="space-y-3">
              <Spinner label={status === 'slow' ? 'Etsy is taking longer than usual — polling…' : 'Publishing to Printify and Etsy…'} />
              <p className="text-xs text-zinc-500">
                Normally finishes in 30–60 seconds. Safe to wait or close — if it
                takes longer it'll show in <a href="/listings" className="underline">Listings</a> once Etsy receives it.
              </p>
            </div>
          )}

          {status === 'queued' && (
            <div className="space-y-3">
              <div className="text-2xl text-center">⏳</div>
              <p className="text-sm text-center">
                Product created on Printify and queued for Etsy publish.
              </p>
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Printify's Etsy publish queue can take 5 minutes to several hours.
                We'll flip the listing to <strong>live</strong> automatically the
                moment Etsy receives it (daily reconcile cron at 6am UTC, or check
                the <a href="/listings" className="underline">Listings page</a> sooner).
              </p>
              <p className="text-xs text-zinc-500">
                You can close this window and move on to the next design.
              </p>
            </div>
          )}

          {status === 'uploading_photos' && (
            <div className="space-y-3">
              <Spinner label="Uploading 6 mockup photos to Etsy…" />
              <p className="text-xs text-zinc-500">
                About 15 seconds. Safe to close — backfill cron picks up if interrupted.
              </p>
            </div>
          )}

          {status === 'live_with_photos' && (
            <div className="space-y-3 text-center">
              <div className="text-4xl">✅</div>
              <p className="text-sm">Listing is live on Etsy with 7 photos.</p>
              {etsyUrl && (
                <a href={etsyUrl} target="_blank" rel="noopener" className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
                  Open on Etsy ↗
                </a>
              )}
            </div>
          )}

          {status === 'photos_failed' && (
            <div className="space-y-3">
              <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ⚠ Listing is live, but photo upload failed: {error}
              </p>
              <p className="text-xs text-zinc-500">
                You can retry from the <a href="/listings" className="underline">Listings page</a>, or the cron will retry within 24h.
              </p>
              {etsyUrl && (
                <a href={etsyUrl} target="_blank" rel="noopener" className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
                  Open on Etsy ↗
                </a>
              )}
            </div>
          )}

          {status === 'live' && (
            <div className="space-y-3 text-center">
              <div className="text-4xl">✅</div>
              <p className="text-sm">Listing is live on Etsy.</p>
              {etsyUrl && (
                <a
                  href={etsyUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white"
                >
                  Open on Etsy ↗
                </a>
              )}
            </div>
          )}

          {status === 'blocked' && (
            <div className="space-y-3">
              <p className="text-sm">Content safety flagged this listing:</p>
              <ul className="list-disc pl-5 text-sm text-amber-700">
                {safetyFlags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Edit the copy above, or override (logged for audit).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  onClick={() => setStatus('editing')}
                >
                  Edit copy
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm text-white"
                  onClick={() => publish(true)}
                >
                  Publish anyway
                </button>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="space-y-3">
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
              <button
                type="button"
                className="rounded-md bg-black px-4 py-2 text-sm text-white"
                onClick={() => setStatus('editing')}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <button type="button" className="rounded-md border border-zinc-300 px-4 py-2 text-sm" onClick={onClose}>
            {status === 'live' || status === 'queued' || status === 'live_with_photos' || status === 'photos_failed' ? 'Close' : 'Cancel'}
          </button>
          {status === 'editing' && (
            <button
              type="button"
              disabled={!canPublish}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => publish(false)}
            >
              Publish to Etsy →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreflightPanel({
  preflight,
  running,
}: {
  preflight: {
    ok: boolean;
    hardFailing: number;
    softFailing: number;
    checks: Array<{ id: string; severity: 'hard' | 'soft'; label: string; ok: boolean; detail?: string }>;
    recommendedPriceCents: number | null;
    marketMedianCents: number | null;
  } | null;
  running: boolean;
}) {
  if (!preflight) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
        {running ? '↻ Running pre-publish checks…' : 'Pre-publish checks queued.'}
      </div>
    );
  }
  const headerClass = preflight.ok
    ? (preflight.softFailing === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50')
    : 'border-red-300 bg-red-50';
  const headerText = preflight.ok
    ? (preflight.softFailing === 0
        ? '✓ All checks pass — ready to publish'
        : `✓ Hard checks pass · ${preflight.softFailing} soft warning${preflight.softFailing === 1 ? '' : 's'}`)
    : `✗ ${preflight.hardFailing} blocker${preflight.hardFailing === 1 ? '' : 's'} — fix before publishing`;
  return (
    <details className={`rounded-md border px-3 py-2 text-xs ${headerClass}`} open={!preflight.ok}>
      <summary className="cursor-pointer select-none font-medium">
        {headerText}
        {preflight.recommendedPriceCents !== null && (
          <span className="ml-2 text-[11px] font-normal text-zinc-600">
            · Will publish at $
            {(preflight.recommendedPriceCents / 100).toFixed(2)}
            {preflight.marketMedianCents !== null && (
              <> (median ${(preflight.marketMedianCents / 100).toFixed(2)})</>
            )}
          </span>
        )}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {preflight.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <span className={c.ok ? 'text-emerald-600' : c.severity === 'hard' ? 'text-red-600' : 'text-amber-600'}>
              {c.ok ? '✓' : c.severity === 'hard' ? '✗' : '⚠'}
            </span>
            <span className="flex-1">
              <span className={c.ok ? 'text-zinc-700' : 'text-zinc-900'}>{c.label}</span>
              {c.detail && (
                <span className="ml-1 text-zinc-500">— {c.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PatternHints({ slogan, title, tags }: { slogan: string; title: string; tags: string[] }) {
  const all = [...checkSloganPatterns(slogan), ...checkTitlePatterns(title, tags)];
  const okCount = all.filter((c) => c.ok).length;
  return (
    <details className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none text-zinc-700">
        <span className="font-medium">Patterns:</span>{' '}
        <span className={okCount >= all.length / 2 ? 'text-emerald-700' : 'text-amber-700'}>
          {okCount}/{all.length} matched
        </span>{' '}
        <span className="text-zinc-400">— click for details</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {all.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <span className={c.ok ? 'text-emerald-600' : 'text-zinc-400'}>{c.ok ? '✓' : '○'}</span>
            <span className="flex-1">
              <span className={c.ok ? 'text-zinc-700' : 'text-zinc-500'}>{c.label}</span>
              {!c.ok && c.hint && (
                <span className="ml-1 text-zinc-400">— {c.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6">
      <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-zinc-200 border-t-zinc-900" />
      <span className="text-sm text-zinc-700">{label}</span>
    </div>
  );
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');
  function addTag(raw: string) {
    const t = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, '').slice(0, 20).trim();
    if (!t) return;
    if (tags.includes(t)) return;
    if (tags.length >= 13) return;
    onChange([...tags, t]);
    setInput('');
  }
  function removeTag(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs"
          >
            {t}
            <button type="button" className="text-zinc-400 hover:text-zinc-700" onClick={() => removeTag(i)}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        placeholder={tags.length < 13 ? 'Type a tag and press Enter or comma' : '13 tags max'}
        value={input}
        disabled={tags.length >= 13}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(input);
          }
        }}
        aria-label="Add tag"
      />
    </div>
  );
}
