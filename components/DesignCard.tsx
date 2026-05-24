'use client';

import Image from 'next/image';
import { useState } from 'react';
import { StatusBadge } from '@/components/BatchStatusBadge';
import type { Design, Listing } from '@/lib/db/schema';
import type { Concept } from '@/lib/schemas';

export type DesignWithListing = Design & { listing: Listing | null };

export function DesignCard({
  design,
  onAction,
}: {
  design: DesignWithListing;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState<string>('');
  const concept = design.concept as Concept;
  const listing = design.listing;
  const previewSrc = listing?.printifyMockupUrls?.[0] ?? design.mockupBlobUrl ?? null;

  async function act(verb: 'approve' | 'reject' | 'regenerate' | 'publish' | 'publish-to-etsy') {
    setBusy(verb);
    setError('');
    try {
      const res = await fetch(`/api/designs/${design.id}/${verb}`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `${verb} failed (${res.status})`);
      }
      onAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const checklist = listing
    ? [
        { ok: !!listing.priceCents, label: `Price ${listing.priceCents ? '$' + (listing.priceCents / 100).toFixed(2) : '—'}` },
        { ok: listing.printifyMockupUrls.length > 0, label: `Mockups (${listing.printifyMockupUrls.length})` },
        { ok: !!listing.description && listing.description.length > 40, label: 'Description' },
        { ok: listing.tags.length >= 10, label: `Tags (${listing.tags.length}/13)` },
        { ok: !!listing.printifyProductId, label: 'Printify product' },
        { ok: !!listing.etsyListingId, label: 'Etsy listing' },
      ]
    : null;

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="relative aspect-square bg-zinc-100">
        {previewSrc ? (
          <Image src={previewSrc} alt={concept.headline} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            {design.status === 'generating' ? 'Generating…' : design.failureReason || 'No preview'}
          </div>
        )}
        {listing?.printifyMockupUrls?.length ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
            Printify mockup
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium" title={listing?.title ?? concept.headline}>
            {listing?.title ?? concept.headline}
          </span>
          <StatusBadge status={design.status} />
        </div>
        <div className="text-xs text-zinc-500">
          {design.style} · {concept.mood}
          {listing?.priceCents != null && (
            <span className="ml-1 font-semibold text-zinc-700">
              · ${(listing.priceCents / 100).toFixed(2)}
            </span>
          )}
        </div>
        {listing?.priceRationale && (
          <div className="rounded bg-zinc-50 px-2 py-1 text-[11px] leading-tight text-zinc-600">
            {listing.priceRationale}
          </div>
        )}
        {design.safetyFlags.length > 0 && (
          <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            ⚠ {design.safetyFlags.join(', ')}
          </div>
        )}
        {checklist && (
          <ul className="space-y-0.5 text-[11px]">
            {checklist.map((c) => (
              <li key={c.label} className={c.ok ? 'text-green-700' : 'text-zinc-400'}>
                {c.ok ? '✓' : '○'} {c.label}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</div>
        )}
        {design.status === 'pending_review' && (
          <div className="flex gap-2 pt-1">
            <button
              disabled={!!busy}
              onClick={() => act('approve')}
              className="flex-1 rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              {busy === 'approve' ? '…' : 'Approve'}
            </button>
            <button
              disabled={!!busy}
              onClick={() => act('reject')}
              className="flex-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
            >
              Reject
            </button>
            <button
              disabled={!!busy}
              onClick={() => act('regenerate')}
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            >
              ↻
            </button>
          </div>
        )}
        {design.status === 'approved' && (
          <button
            disabled={!!busy}
            onClick={() => act('publish')}
            className="w-full rounded bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy === 'publish' ? 'Publishing to Printify…' : 'Publish to Printify'}
          </button>
        )}
        {(design.status === 'publishing' || design.status === 'live') && listing?.printifyProductId && (
          <div className="space-y-1.5">
            {listing.status !== 'publishing_slow' && listing.status !== 'live' && (
              <button
                disabled={!!busy}
                onClick={() => act('publish-to-etsy')}
                className="w-full rounded bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === 'publish-to-etsy' ? 'Pushing to Etsy…' : 'Push to Etsy via Printify'}
              </button>
            )}
            {listing.status === 'publishing_slow' && (
              <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                ⏱ Etsy publish queued at Printify — listing ID arrives via webhook
              </div>
            )}
            <a
              href={`https://printify.com/app/products/${listing.printifyProductId}`}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded border border-zinc-200 px-2 py-1 text-center text-xs text-zinc-700 hover:bg-zinc-50"
            >
              Open in Printify ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
