'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Concept } from '@/lib/schemas';
import { MockupGallery } from './mockup-gallery';
import { StatusBadge } from '@/components/status-badge';

type Row = {
  id: string;
  title: string;
  status: 'publishing' | 'publishing_slow' | 'live' | 'failed';
  etsyListingId: string | null;
  printifyProductId: string | null;
  publishedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  designId: string;
  designMockupUrl: string | null;
  designHeadline: unknown;
  photosUploadedAt: Date | null;
  photosCount: number;
  photosFailureReason: string | null;
};

const STATUSES = ['all', 'live', 'publishing', 'failed'] as const;
type Filter = (typeof STATUSES)[number];

export function ListingsTable({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [galleryFor, setGalleryFor] = useState<{ designId: string; listingId: string; etsyListingId: string | null } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = rows.filter((r) => !hiddenIds.has(r.id));
  const filtered = filter === 'all'
    ? visible
    : filter === 'publishing'
      ? visible.filter((r) => r.status === 'publishing' || r.status === 'publishing_slow')
      : visible.filter((r) => r.status === filter);

  async function deleteListing(id: string, status: Row['status']) {
    const msg = status === 'live'
      ? 'Delete this LIVE listing from your app? The Printify product will be deleted, but the Etsy listing itself will NOT be removed automatically — you must unlist it from Etsy manually.'
      : 'Delete this listing? Any Printify product will also be removed.';
    if (!confirm(msg)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Delete failed');
        return;
      }
      setHiddenIds((s) => new Set(s).add(id));
    } finally {
      setDeletingId(null);
    }
  }

  function openGallery(r: Row) {
    setGalleryFor({ designId: r.designId, listingId: r.id, etsyListingId: r.etsyListingId });
  }

  async function uploadPhotos(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/listings/${id}/photos`, { method: 'POST' });
      const text = await res.text();
      if (!text) {
        alert('Server timed out. Refreshing.');
      } else {
        try {
          const j = JSON.parse(text);
          if (!j.ok) alert(j.error || 'Upload failed');
        } catch {
          alert(`Unexpected response (${res.status})`);
        }
      }
      window.location.reload();
    } finally {
      setRetryingId(null);
    }
  }

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/listings/${id}/retry`, { method: 'POST' });
      const text = await res.text();
      if (!text) {
        alert('Retry is still running on the server. Refreshing to check current state.');
      } else {
        try {
          const j = JSON.parse(text);
          if (!res.ok && !j.ok) alert(j.error || 'Retry failed');
        } catch {
          alert(`Unexpected response from server (${res.status}). Refreshing.`);
        }
      }
      window.location.reload();
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              'press rounded-full border px-3.5 py-1 text-xs transition-colors ' +
              (filter === s
                ? 'border-foreground bg-foreground font-medium text-background'
                : 'border-border bg-card text-muted-foreground hover:text-foreground')
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="min-w-full divide-y">
          <thead className="bg-secondary/60">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Design</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => {
              const concept = r.designHeadline as Concept | null;
              return (
                <tr key={r.id} className="transition-colors hover:bg-secondary/50">
                  <td className="w-16 px-3 py-2">
                    {r.designMockupUrl && (
                      <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-secondary ring-1 ring-foreground/10">
                        <Image src={r.designMockupUrl} alt="" fill className="object-contain p-1" unoptimized />
                      </div>
                    )}
                  </td>
                  <td className="max-w-md px-3 py-2 text-sm">
                    <div className="font-medium truncate" title={r.title}>{r.title}</div>
                    {concept?.headline && (
                      <div className="text-xs text-zinc-500 truncate">"{concept.headline}"</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <StatusBadge status={r.status} />
                    {r.failureReason && (
                      <div className="mt-1 text-xs text-red-600" title={r.failureReason}>
                        {r.failureReason.slice(0, 80)}…
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.photosUploadedAt ? (
                      <div className="flex flex-col gap-1">
                        <span className={r.photosCount === 6 ? 'text-emerald-700' : 'text-amber-700'}>
                          ✓ {r.photosCount} photos
                        </span>
                        {r.status === 'live' && (
                          <button
                            type="button"
                            onClick={() => openGallery(r)}
                            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] text-violet-700 hover:bg-violet-100"
                            title="Open AI mockup gallery"
                          >
                            ✨ AI mockups
                          </button>
                        )}
                      </div>
                    ) : r.status === 'live' ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={retryingId === r.id}
                          onClick={() => uploadPhotos(r.id)}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                        >
                          {retryingId === r.id ? 'Uploading…' : '↑ Add photos'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openGallery(r)}
                          className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] text-violet-700 hover:bg-violet-100"
                          title="Open AI mockup gallery"
                        >
                          ✨ AI mockups
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.etsyListingId && (
                      <a
                        href={`https://www.etsy.com/listing/${r.etsyListingId}`}
                        target="_blank"
                        rel="noopener"
                        className="text-blue-600 hover:underline"
                      >
                        Etsy ↗
                      </a>
                    )}
                    {r.etsyListingId && r.printifyProductId && ' · '}
                    {r.printifyProductId && (
                      <a
                        href={`https://printify.com/app/products/${r.printifyProductId}`}
                        target="_blank"
                        rel="noopener"
                        className="text-blue-600 hover:underline"
                      >
                        Printify ↗
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === 'failed' && (
                        <button
                          type="button"
                          disabled={retryingId === r.id}
                          onClick={() => retry(r.id)}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                        >
                          {retryingId === r.id ? 'Retrying…' : 'Retry'}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Delete listing"
                        disabled={deletingId === r.id}
                        onClick={() => deleteListing(r.id, r.status)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title={r.status === 'live' ? 'Delete — does NOT unlist from Etsy' : 'Delete listing'}
                      >
                        {deletingId === r.id ? '…' : '🗑'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-14 text-center text-sm text-muted-foreground">
                  <span className="mb-1 block text-2xl" aria-hidden>👕</span>
                  No listings yet — approve a design and hit publish.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {galleryFor && (
        <MockupGallery
          designId={galleryFor.designId}
          listingId={galleryFor.listingId}
          etsyListingId={galleryFor.etsyListingId}
          onClose={() => setGalleryFor(null)}
        />
      )}
    </>
  );
}

