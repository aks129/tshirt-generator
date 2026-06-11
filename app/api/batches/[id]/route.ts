import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { batches, designs, listings, generationEvents } from '@/lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false }, { status: 404 });
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  return NextResponse.json({ ok: true, batch, designs: designRows });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  const designIds = designRows.map((d) => d.id);

  if (designIds.length > 0) {
    const liveListings = await db
      .select({ id: listings.id, title: listings.title })
      .from(listings)
      .where(and(inArray(listings.designId, designIds), eq(listings.status, 'live')));
    if (liveListings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Batch has ${liveListings.length} live listing(s). Reject those designs first.`,
          liveListings,
        },
        { status: 409 },
      );
    }
  }

  // Cascade: listings (non-live by precondition) → generation_events → designs → batch
  if (designIds.length > 0) {
    await db.delete(listings).where(inArray(listings.designId, designIds));
    await db.delete(generationEvents).where(inArray(generationEvents.designId, designIds));
  }
  await db.delete(generationEvents).where(eq(generationEvents.batchId, id));
  await db.delete(designs).where(eq(designs.batchId, id));
  await db.delete(batches).where(eq(batches.id, id));

  return NextResponse.json({ ok: true, designsDeleted: designIds.length });
}
