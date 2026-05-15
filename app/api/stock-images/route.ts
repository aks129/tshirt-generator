import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { stockImages } from '@/lib/db/schema';
import { generateImage } from '@/lib/recraft/client';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STYLE_VALUES = ['digital_illustration', 'realistic_image', 'vector_illustration'] as const;

const bodySchema = z.object({
  prompt: z.string().min(3).max(500),
  style: z.enum(STYLE_VALUES).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

// Bias Recraft toward producing JUST the subject on a transparent background —
// not a photo of a t-shirt with the subject printed on it. The previous suffix
// said 't-shirt design ready' which Recraft interpreted as 'render a t-shirt'.
const TRANSPARENT_PROMPT_SUFFIX =
  ', isolated subject only, centered, transparent background, no clothing, no t-shirt, no fabric, no background scene, no shadow, no frame, just the subject itself';

export async function GET() {
  const rows = await db.select().from(stockImages).orderBy(desc(stockImages.createdAt));
  return NextResponse.json({ ok: true, images: rows });
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid body', issues: parsed.error.format() }, { status: 400 });
  }

  const { prompt, style = 'digital_illustration', tags = [] } = parsed.data;

  let url: string;
  try {
    // Bias toward t-shirt-ready output (transparent bg). Recraft respects this
    // most reliably with digital_illustration / vector_illustration styles.
    url = await generateImage({
      prompt: prompt + TRANSPARENT_PROMPT_SUFFIX,
      style,
      size: '1024x1024',
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    return NextResponse.json({ ok: false, error: `Recraft download failed ${resp.status}` }, { status: 502 });
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const path = `stock-images/${Date.now()}_${prompt.slice(0, 40).replace(/[^a-z0-9]+/gi, '_')}.png`;
  const blob = await put(path, buffer, { access: 'public', contentType: 'image/png' });

  const [row] = await db.insert(stockImages).values({
    prompt,
    style,
    blobUrl: blob.url,
    tags,
  }).returning();

  await logEvent({
    type: 'generated',
    payload: { kind: 'stock_image', stockImageId: row.id, style },
  });

  return NextResponse.json({ ok: true, image: row });
}
