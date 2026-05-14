'use client';

import { useState } from 'react';
import Link from 'next/link';

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
    return <li className="px-4 py-6 text-sm text-zinc-500">No batches yet.</li>;
  }

  return (
    <>
      {visible.map((b) => (
        <li key={b.id} className="flex items-center hover:bg-zinc-50">
          <Link href={`/batches/${b.id}`} className="flex flex-1 items-center justify-between px-4 py-3">
            <span className="truncate">{b.prompt}</span>
            <span className="text-xs text-zinc-500">{b.status}</span>
          </Link>
          <button
            type="button"
            aria-label="Delete batch"
            disabled={deletingId === b.id}
            onClick={() => deleteBatch(b.id)}
            className="mr-3 rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {deletingId === b.id ? '…' : '🗑'}
          </button>
        </li>
      ))}
    </>
  );
}
