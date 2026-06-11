'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handle() {
    if (!confirm('Delete this batch? All designs and pending listings will be removed.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/batches/${batchId}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Delete failed');
        setDeleting(false);
        return;
      }
      router.push('/');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={deleting}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-50"
    >
      {deleting ? 'Deleting…' : 'Delete batch'}
    </button>
  );
}
