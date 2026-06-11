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
