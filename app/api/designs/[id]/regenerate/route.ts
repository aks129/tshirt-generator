import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { designs, batches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent } from '@/lib/events';
import { start } from 'workflow/api';
import { generateBatch } from '@/app/workflows/generate-batch';
import type { Concept } from '@/lib/schemas';
import { requireOwnedDesign } from '@/lib/auth/ownership';
import { getRequestUser } from '@/lib/auth/current-user';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  const user = await getRequestUser(req);
  const original = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!original) return NextResponse.json({ ok: false }, { status: 404 });

  await db.update(designs).set({ status: 'rejected' }).where(eq(designs.id, id));

  const [newBatch] = await db.insert(batches).values({
    userId: user?.id,
    prompt: `(regenerate) ${(original.concept as Concept).headline}`,
    styles: [original.style],
    requestedCount: 1,
    status: 'generating',
  }).returning();

  const run = await start(generateBatch, [newBatch.id]);
  await db.update(batches).set({ workflowRunId: run.runId }).where(eq(batches.id, newBatch.id));

  await logEvent({
    type: 'regenerated', designId: id, batchId: original.batchId,
    payload: { newBatchId: newBatch.id },
  });

  return NextResponse.json({ ok: true, newBatchId: newBatch.id });
}
