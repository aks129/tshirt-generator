import { db } from '@/lib/db/client';
import { batches, designs, listings } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ReviewGrid } from './review-grid';
import { DeleteBatchButton } from './delete-batch-button';

export const dynamic = 'force-dynamic';

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) notFound();
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  const ids = designRows.map((d) => d.id);
  const listingRows = ids.length
    ? await db.query.listings.findMany({ where: inArray(listings.designId, ids) })
    : [];
  const listingByDesign = Object.fromEntries(listingRows.map((l) => [l.designId, l]));
  const enriched = designRows.map((d) => ({ ...d, listing: listingByDesign[d.id] ?? null }));
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review batch</h1>
          <p className="text-sm text-zinc-500">{batch.prompt}</p>
        </div>
        <DeleteBatchButton batchId={batch.id} />
      </header>
      <ReviewGrid initialBatch={batch} initialDesigns={enriched} />
    </div>
  );
}
