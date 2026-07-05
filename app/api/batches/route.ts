import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { batches } from '@/lib/db/schema';
import { canStartBatch } from '@/lib/caps/enforcement';
import { designStyleSchema } from '@/lib/schemas';
import { start } from 'workflow/api';
import { generateBatch } from '@/app/workflows/generate-batch';
import { getRequestUser } from '@/lib/auth/current-user';
import { eq } from 'drizzle-orm';

const bodySchema = z.object({
  prompt: z.string().min(3).max(500),
  styles: z.array(designStyleSchema).min(1),
  count: z.number().int().min(1).max(20),
  nicheTag: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 });
  }

  const caps = await canStartBatch({ requestedCount: parsed.data.count });
  if (!caps.ok) {
    return NextResponse.json({ ok: false, error: caps.reason }, { status: 429 });
  }

  const user = await getRequestUser(req);
  const [row] = await db.insert(batches).values({
    userId: user?.id,
    prompt: parsed.data.prompt,
    styles: parsed.data.styles,
    requestedCount: parsed.data.count,
    nicheTag: parsed.data.nicheTag,
    status: 'generating',
  }).returning();

  const run = await start(generateBatch, [row.id]);
  await db.update(batches).set({ workflowRunId: run.runId }).where(eq(batches.id, row.id));

  return NextResponse.json({ ok: true, batchId: row.id });
}
