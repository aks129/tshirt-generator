import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { batches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { start } from 'workflow/api';
import { publishBatch } from '@/app/workflows/publish-batch';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 });

  const run = await start(publishBatch, [id]);
  return NextResponse.json({ ok: true, runId: run.runId });
}
