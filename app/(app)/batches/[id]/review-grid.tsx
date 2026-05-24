'use client';

import { useEffect, useState } from 'react';
import { DesignCard, type DesignWithListing } from '@/components/DesignCard';
import type { Batch } from '@/lib/db/schema';

export function ReviewGrid({
  initialBatch,
  initialDesigns,
}: {
  initialBatch: Batch;
  initialDesigns: DesignWithListing[];
}) {
  const [designs, setDesigns] = useState(initialDesigns);
  const [batch, setBatch] = useState(initialBatch);

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Status: {batch.status}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {designs.map((d) => (
          <DesignCard key={d.id} design={d} onAction={refresh} />
        ))}
      </div>
    </div>
  );
}
