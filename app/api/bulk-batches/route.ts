import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { uploadPng } from '@/lib/blob/upload';
import { composeMockup } from '@/lib/images/mockup';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Meta = {
  fontName: string;
  font: string;
  textColor: string;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  shirtColor: string;
};

export async function POST(req: Request) {
  const form = await req.formData();
  const metaRaw = form.get('meta');
  if (typeof metaRaw !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing meta' }, { status: 400 });
  }

  let meta: Meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad meta JSON' }, { status: 400 });
  }

  const collected: { text: string; png: File }[] = [];
  for (let i = 0; ; i++) {
    const textField = form.get(`design[${i}][text]`);
    const pngField = form.get(`design[${i}][png]`);
    if (textField == null && pngField == null) break;
    if (typeof textField !== 'string' || !(pngField instanceof File)) {
      return NextResponse.json(
        { ok: false, error: `Malformed design[${i}]` },
        { status: 400 },
      );
    }
    if (!textField.trim()) continue;
    collected.push({ text: textField, png: pngField });
  }

  if (collected.length === 0) {
    return NextResponse.json({ ok: false, error: 'No designs supplied' }, { status: 400 });
  }

  const [batch] = await db
    .insert(batches)
    .values({
      prompt: `Bulk: ${collected[0].text.slice(0, 80)}${collected.length > 1 ? ` (+${collected.length - 1} more)` : ''}`,
      styles: ['typography'],
      requestedCount: collected.length,
      status: 'ready',
    })
    .returning();

  await logEvent({
    type: 'generated',
    batchId: batch.id,
    payload: { source: 'bulk-canvas', count: collected.length, meta },
  });

  const failures: string[] = [];

  for (const item of collected) {
    try {
      const pngBuffer = Buffer.from(await item.png.arrayBuffer());

      const [designRow] = await db
        .insert(designs)
        .values({
          batchId: batch.id,
          style: 'typography',
          concept: {
            headline: item.text,
            illustration_prompt: 'n/a',
            palette: [meta.textColor, meta.shirtColor],
            mood: meta.fontName,
            niche_keywords: [],
            settings: meta,
          },
          status: 'generating',
        })
        .returning();

      const imageUrl = await uploadPng({
        buffer: pngBuffer,
        key: `designs/${designRow.id}.png`,
      });

      const mockup = await composeMockup(pngBuffer);
      const mockupUrl = await uploadPng({
        buffer: mockup,
        key: `mockups/${designRow.id}.png`,
      });

      await db
        .update(designs)
        .set({
          imageBlobUrl: imageUrl,
          mockupBlobUrl: mockupUrl,
          status: 'pending_review',
          modelUsed: 'bulk-canvas',
          generationCostCents: 0,
        })
        .where(eq(designs.id, designRow.id));

      await logEvent({
        type: 'generated',
        designId: designRow.id,
        batchId: batch.id,
        payload: { source: 'bulk-canvas', text: item.text },
      });
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    count: collected.length,
    failures: failures.length ? failures : undefined,
  });
}
