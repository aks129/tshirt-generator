'use client';

import Image from 'next/image';
import { useState } from 'react';
import { StatusBadge } from '@/components/BatchStatusBadge';
import type { Design } from '@/lib/db/schema';
import type { Concept } from '@/lib/schemas';

export function DesignCard({ design, onAction, onApprove }: {
  design: Design;
  onAction: () => void;
  onApprove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const concept = design.concept as Concept;

  async function act(verb: 'approve' | 'reject' | 'regenerate') {
    setBusy(true);
    try {
      await fetch(`/api/designs/${design.id}/${verb}`, { method: 'POST' });
      onAction();
    } finally { setBusy(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="relative aspect-square bg-zinc-100">
        {design.mockupBlobUrl ? (
          <Image src={design.mockupBlobUrl} alt={concept.headline} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            {design.status === 'generating' ? 'Generating…' : design.failureReason || 'No preview'}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">{concept.headline}</span>
          <StatusBadge status={design.status} />
        </div>
        <div className="text-xs text-zinc-500">{design.style} · {concept.mood}</div>
        {design.safetyFlags.length > 0 && (
          <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            ⚠ {design.safetyFlags.join(', ')}
          </div>
        )}
        {design.status === 'pending_review' && (
          <div className="flex gap-2 pt-1">
            <button
              disabled={busy}
              onClick={() => onApprove ? onApprove() : act('approve')}
              className="flex-1 rounded bg-black px-2 py-1 text-xs text-white"
              type="button"
            >Approve</button>
            <button disabled={busy} onClick={() => act('reject')} className="flex-1 rounded border px-2 py-1 text-xs">Reject</button>
            <button disabled={busy} onClick={() => act('regenerate')} className="rounded border px-2 py-1 text-xs">↻</button>
          </div>
        )}
      </div>
    </div>
  );
}
