'use client';

import { useEffect, useState } from 'react';
import type { Design } from '@/lib/db/schema';
import type { Concept } from '@/lib/schemas';
import type { ListingCopy } from '@/lib/etsy/validators';

type Draft = ListingCopy & { source: 'gemini' | 'fallback' };
type ModalStatus = 'loading_draft' | 'editing' | 'publishing' | 'live' | 'slow' | 'failed' | 'blocked';

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
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceRec, setPriceRec] = useState<null | {
    source: 'fresh' | 'cached' | 'stale' | 'unavailable';
    sampleCount: number;
    statistics: { min: number; median: number; max: number } | null;
    fetchedAt: string | null;
  }>(null);
  const [priceFloorCents, setPriceFloorCents] = useState<number>(1499);
  const [priceRefreshing, setPriceRefreshing] = useState(false);

  const concept = design.concept as Concept;

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

    async function fetchPriceRec(force = false) {
      try {
        const qs = force ? '?force=true' : '';
        const res = await fetch(`/api/designs/${design.id}/price-recommendation${qs}`, { method: 'POST' });
        const text = await res.text();
        if (cancelled) return;
        if (!text) return;
        let json: { ok?: boolean; recommendedCents?: number; source?: string; sampleCount?: number; statistics?: { min: number; median: number; max: number } | null; fetchedAt?: string | null };
        try { json = JSON.parse(text); } catch { return; }
        if (!json.ok || typeof json.recommendedCents !== 'number') return;
        setPriceCents(json.recommendedCents);
        setPriceRec({
          source: (json.source ?? 'unavailable') as 'fresh' | 'cached' | 'stale' | 'unavailable',
          sampleCount: json.sampleCount ?? 0,
          statistics: json.statistics ?? null,
          fetchedAt: json.fetchedAt ?? null,
        });
      } catch {
        /* silent — modal still usable without price rec */
      }
    }

    // Pull settings floor for client-side validation
    fetch('/api/settings/floor').then((r) => r.json()).then((j) => {
      if (!cancelled && j?.floorCents) setPriceFloorCents(j.floorCents);
    }).catch(() => {});

    fetchDraft();
    fetchPriceRec(false);

    // Expose refresh
    (window as unknown as { __refreshPriceRec?: () => Promise<void> }).__refreshPriceRec = async () => {
      setPriceRefreshing(true);
      try {
        await fetchPriceRec(true);
      } finally {
        setPriceRefreshing(false);
      }
    };

    return () => {
      cancelled = true;
      delete (window as unknown as { __refreshPriceRec?: () => Promise<void> }).__refreshPriceRec;
    };
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
          price_cents: priceCents ?? priceFloorCents,
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
  }

  function updateField<K extends keyof ListingCopy>(field: K, value: ListingCopy[K]) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value } as Draft);
  }

  const titleLen = draft?.title.length ?? 0;
  const tagsValid = draft && draft.tags.length === 13 && draft.tags.every((t) => /^[a-z0-9 ]+$/.test(t) && t.length <= 20);
  const priceValid = priceCents !== null && priceCents >= priceFloorCents;
  const canPublish = !!draft && titleLen >= 5 && titleLen <= 140 && !!tagsValid && draft.description.length >= 20 && priceValid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-bold">
            {status === 'live' ? '✓ Listed on Etsy' :
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
              <Field label="Price">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min={priceFloorCents / 100}
                      className={`w-32 rounded-md border px-3 py-2 text-sm ${
                        priceCents !== null && priceCents < priceFloorCents
                          ? 'border-red-500'
                          : 'border-zinc-300'
                      }`}
                      value={priceCents !== null ? (priceCents / 100).toFixed(2) : ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) setPriceCents(Math.round(v * 100));
                      }}
                      aria-label="Price in dollars"
                    />
                    <button
                      type="button"
                      disabled={priceRefreshing}
                      onClick={() =>
                        (window as unknown as { __refreshPriceRec?: () => Promise<void> })
                          .__refreshPriceRec?.()
                      }
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {priceRefreshing ? '…' : '↻ Refresh competitive data'}
                    </button>
                  </div>
                  {priceRec && priceRec.statistics && priceRec.source !== 'unavailable' && (
                    <p className={
                      priceRec.source === 'stale'
                        ? 'text-xs text-amber-700'
                        : 'text-xs text-zinc-500'
                    }>
                      {priceRec.source === 'stale' && '⚠ Stale: '}
                      Based on {priceRec.sampleCount} t-shirts · median $
                      {(priceRec.statistics.median / 100).toFixed(2)} · range $
                      {(priceRec.statistics.min / 100).toFixed(2)}–$
                      {(priceRec.statistics.max / 100).toFixed(2)}
                    </p>
                  )}
                  {priceRec && priceRec.source === 'unavailable' && (
                    <p className="text-xs text-amber-700">
                      ⚠ Couldn't fetch competitive data — using floor price.
                    </p>
                  )}
                  {priceCents !== null && priceCents < priceFloorCents && (
                    <p className="text-xs text-red-600">
                      Below floor (${(priceFloorCents / 100).toFixed(2)})
                    </p>
                  )}
                </div>
              </Field>
              {draft.source === 'fallback' && (
                <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠ AI was unavailable — using a basic fallback draft. Edit before publishing.
                </p>
              )}
            </div>
          )}

          {(status === 'publishing' || status === 'slow') && (
            <div className="space-y-3">
              <Spinner label={status === 'slow' ? 'Etsy is taking longer than usual — polling…' : 'Publishing to Printify and Etsy…'} />
              <p className="text-xs text-zinc-500">
                This can take 30–60 seconds. Don't close this window.
              </p>
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
            {status === 'live' ? 'Close' : 'Cancel'}
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
