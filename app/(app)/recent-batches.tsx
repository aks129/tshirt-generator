'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';

type Row = {
  id: string;
  prompt: string;
  status: string;
};

export function RecentBatches({ rows }: { rows: Row[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  async function deleteBatch(id: string) {
    if (!confirm('Delete this batch? All designs and pending listings will be removed.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/batches/${id}`, { method: 'DELETE' });
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

  const visible = rows.filter((r) => !hiddenIds.has(r.id));
  if (visible.length === 0) {
    return (
      <li className="px-4 py-10 text-center text-sm text-muted-foreground">
        <span className="mb-1 block text-2xl" aria-hidden>🧵</span>
        Nothing on the rack yet — start your first batch.
      </li>
    );
  }

  return (
    <>
      {visible.map((b) => (
        <li key={b.id} className="flex items-center transition-colors hover:bg-secondary/60">
          <Link href={`/batches/${b.id}`} className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
            <span className="truncate">{b.prompt}</span>
            <StatusBadge status={b.status} />
          </Link>
          <button
            type="button"
            aria-label="Delete batch"
            disabled={deletingId === b.id}
            onClick={() => deleteBatch(b.id)}
            className="press mr-3 rounded-full p-1.5 text-muted-foreground/60 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {deletingId === b.id ? '…' : '🗑'}
          </button>
        </li>
      ))}
    </>
  );
}
