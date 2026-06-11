import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { stockImages } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await db.query.stockImages.findFirst({ where: eq(stockImages.id, id) });
  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  // Note: the Blob itself is left in storage. Vercel Blob doesn't bill aggressively
  // for orphans, and there's no convenient cascading delete API for Blob URLs.
  await db.delete(stockImages).where(eq(stockImages.id, id));
  return NextResponse.json({ ok: true });
}
