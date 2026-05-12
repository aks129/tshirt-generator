import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ReviewGrid } from './review-grid';

export const dynamic = 'force-dynamic';

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) notFound();
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Review batch</h1>
        <p className="text-sm text-zinc-500">{batch.prompt}</p>
      </header>
      <ReviewGrid initialBatch={batch} initialDesigns={designRows} />
    </div>
  );
}
