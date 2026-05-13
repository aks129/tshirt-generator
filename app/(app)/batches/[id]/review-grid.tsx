'use client';

import { useEffect, useState } from 'react';
import { DesignCard } from '@/components/DesignCard';
import { PublishModal } from './publish-modal';
import type { Batch, Design } from '@/lib/db/schema';

export function ReviewGrid({ initialBatch, initialDesigns }: { initialBatch: Batch; initialDesigns: Design[] }) {
  const [designs, setDesigns] = useState(initialDesigns);
  const [batch, setBatch] = useState(initialBatch);
  const [modalDesign, setModalDesign] = useState<Design | null>(null);

  async function refresh() {
    const res = await fetch(`/api/batches/${initialBatch.id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) {
      setBatch(json.batch);
      setDesigns(json.designs);
    }
  }

  useEffect(() => {
    if (batch.status === 'generating') {
      const t = setInterval(refresh, 3000);
      return () => clearInterval(t);
    }
  }, [batch.status]);

  const pendingDesigns = designs.filter((d) => d.status === 'pending_review');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>Status: {batch.status}</span>
        {pendingDesigns.length > 0 && (
          <button
            type="button"
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
            onClick={() => setModalDesign(pendingDesigns[0])}
          >
            Approve all and draft ({pendingDesigns.length})
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {designs.map((d) => (
          <DesignCard
            key={d.id}
            design={d}
            onAction={refresh}
            onApprove={() => setModalDesign(d)}
          />
        ))}
      </div>
      {modalDesign && (
        <PublishModal
          design={modalDesign}
          onClose={() => setModalDesign(null)}
          onPublished={() => {
            refresh();
            const nextPending = designs.find(
              (d) => d.id !== modalDesign.id && d.status === 'pending_review',
            );
            setModalDesign(nextPending ?? null);
          }}
        />
      )}
    </div>
  );
}
