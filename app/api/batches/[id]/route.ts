import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false }, { status: 404 });
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  return NextResponse.json({ ok: true, batch, designs: designRows });
}
