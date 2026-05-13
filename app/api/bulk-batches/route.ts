import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';

const metaSchema = z.object({
  fontName: z.string(),
  font: z.string(),
  textColor: z.string(),
  hAlign: z.enum(['left', 'center', 'right']),
  vAlign: z.enum(['top', 'middle', 'bottom']),
  shirtColor: z.string(),
});

const bodySchema = z.object({
  meta: metaSchema,
  designs: z
    .array(
      z.object({
        text: z.string().min(1),
        blobUrl: z.string().url(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.format() },
      { status: 400 },
    );
  }

  const { meta, designs: designInputs } = parsed.data;

  const [batch] = await db
    .insert(batches)
    .values({
      prompt: `Bulk: ${designInputs[0].text.slice(0, 80)}${designInputs.length > 1 ? ` (+${designInputs.length - 1} more)` : ''}`,
      styles: ['typography'],
      requestedCount: designInputs.length,
      status: 'ready',
    })
    .returning();

  await logEvent({
    type: 'generated',
    batchId: batch.id,
    payload: { source: 'bulk-canvas', count: designInputs.length, meta },
  });

  const insertedIds: string[] = [];

  for (const d of designInputs) {
    const [row] = await db
      .insert(designs)
      .values({
        batchId: batch.id,
        style: 'typography',
        concept: {
          headline: d.text,
          illustration_prompt: 'n/a',
          palette: [meta.textColor, meta.shirtColor],
          mood: meta.fontName,
          niche_keywords: [],
          settings: meta,
        },
        imageBlobUrl: d.blobUrl,
        mockupBlobUrl: d.blobUrl,
        status: 'pending_review',
        modelUsed: 'bulk-canvas',
        generationCostCents: 0,
      })
      .returning();

    insertedIds.push(row.id);

    await logEvent({
      type: 'generated',
      designId: row.id,
      batchId: batch.id,
      payload: { source: 'bulk-canvas', text: d.text },
    });
  }

  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    count: insertedIds.length,
  });
}
