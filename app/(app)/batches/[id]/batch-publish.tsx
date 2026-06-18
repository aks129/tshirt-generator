// app/(app)/batches/[id]/batch-publish.tsx
'use client';

import { useState } from 'react';
import type { Design } from '@/lib/db/schema';

export function BatchPublish({ designs, onDone }: { designs: Design[]; onDone: () => void }) {
  const publishable = designs.filter((d) => d.status === 'pending_review' || d.status === 'approved');
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function run() {
    const batchId = designs[0]?.batchId;
    if (!batchId) return;
    if (!confirm(`Publish ${publishable.length} design(s) to Etsy? Publishing runs in the background — you can close this tab.`)) return;
    setRunning(true);
    setNote('');
    setError('');
    try {
      const res = await fetch(`/api/batches/${batchId}/publish-all`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) {
        setError(j.error ?? 'Failed to start publishing');
        setRunning(false);
        return;
      }
      setNote('Publishing started — running in the background. Status updates as each listing goes live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setRunning(false);
    }
    onDone();
  }

  if (publishable.length === 0) return null;

  return (
    <div className="rounded-xl border border-secondary bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">Batch publish</span>
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="press rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? 'Starting…' : `Publish all (${publishable.length})`}
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
