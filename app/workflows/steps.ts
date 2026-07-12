import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { expandBrief } from '@/lib/ai/brief-expander';
import { checkSafety } from '@/lib/ai/content-safety';
import { generateTypographySVG } from '@/lib/ai/svg-generator';
import { rasterizeSVG } from '@/lib/images/rasterize';
import { assertNotBlank } from '@/lib/images/ink-coverage';
import { generateImage } from '@/lib/recraft/client';
import { detectHasBackground, attemptWhiteBgRemoval } from '@/lib/images/bg-remove';
import { uploadPng } from '@/lib/blob/upload';
import { composeMockup } from '@/lib/images/mockup';
import { logEvent } from '@/lib/events';
import { canStartBatch, killSwitchActive } from '@/lib/caps/enforcement';
import type { Concept, DesignStyle } from '@/lib/schemas';

const RECRAFT_COST_CENTS = 4;
const GEMINI_SVG_COST_CENTS = 0;

export async function loadBatchStep(batchId: string) {
  'use step';
  const row = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  if (!row) throw new Error(`Batch ${batchId} not found`);
  return row;
}

export async function checkCapsStep(requestedCount: number, userId: string | null) {
  'use step';
  return canStartBatch({ requestedCount, userId });
}

export async function markBatchFailedStep(batchId: string, reason: string) {
  'use step';
  await db.update(batches).set({ status: 'failed' }).where(eq(batches.id, batchId));
  await logEvent({ type: 'rejected', batchId, payload: { reason } });
}

export async function expandBriefStep(prompt: string, styles: DesignStyle[], count: number): Promise<Concept[]> {
  'use step';
  return expandBrief({ prompt, styles, count });
}

export async function insertDesignRowsStep(batchId: string, concepts: Concept[]) {
  'use step';
  const rows = await db.insert(designs).values(
    concepts.map((c) => ({
      batchId,
      style: c.style,
      concept: c,
      status: 'generating' as const,
    })),
  ).returning();
  return rows;
}

export async function markBatchReadyStep(batchId: string) {
  'use step';
  await db.update(batches).set({ status: 'ready' }).where(eq(batches.id, batchId));
}

export async function generateOneDesignStep(designId: string, concept: Concept, batchId: string, userId: string | null) {
  'use step';
  try {
    if (await killSwitchActive(userId)) {
      await db.update(designs).set({ status: 'failed', failureReason: 'Kill switch active' })
        .where(eq(designs.id, designId));
      return;
    }

    const safety = await checkSafety({
      headline: concept.headline,
      illustrationPrompt: concept.illustration_prompt,
    });

    let pngBuffer: Buffer;
    let modelUsed: string;
    let costCents: number;

    if (concept.style === 'typography') {
      const svg = await generateTypographySVG({
        headline: concept.headline,
        palette: concept.palette,
        mood: concept.mood,
      });
      pngBuffer = await rasterizeSVG(svg);
      // A missing font makes resvg drop <text> silently → blank shirt on
      // Etsy. Fail the design loudly instead.
      await assertNotBlank(pngBuffer, `typography design ${designId}`);
      modelUsed = 'gemini-svg';
      costCents = GEMINI_SVG_COST_CENTS;
    } else {
      const styledPrompt = concept.style === 'vintage'
        ? `${concept.illustration_prompt}. Vintage 70s-80s retro aesthetic, distressed texture, faux-screenprint, palette: ${concept.palette.join(', ')}. Transparent background.`
        : `${concept.illustration_prompt}. Clean vector illustration, palette: ${concept.palette.join(', ')}. Transparent background.`;

      const url = await generateImage({
        prompt: styledPrompt,
        style: 'digital_illustration',
        idempotencyKey: `${batchId}:${designId}`,
      });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Recraft image download failed ${resp.status}`);
      pngBuffer = Buffer.from(await resp.arrayBuffer());
      modelUsed = 'recraft-v3';
      costCents = RECRAFT_COST_CENTS;
    }

    const hasBg = await detectHasBackground(pngBuffer);
    const cleanedPng = hasBg ? await attemptWhiteBgRemoval(pngBuffer) : pngBuffer;

    const imageUrl = await uploadPng({ buffer: cleanedPng, key: `designs/${designId}.png` });
    const mockup = await composeMockup(cleanedPng);
    const mockupUrl = await uploadPng({ buffer: mockup, key: `mockups/${designId}.png` });

    await db.update(designs).set({
      imageBlobUrl: imageUrl,
      mockupBlobUrl: mockupUrl,
      status: 'pending_review',
      modelUsed,
      generationCostCents: costCents,
      safetyFlags: safety.flags,
    }).where(eq(designs.id, designId));

    await logEvent({
      type: 'generated', designId, batchId,
      payload: { modelUsed, costCents, safetyFlags: safety.flags },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.update(designs)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(designs.id, designId));
    await logEvent({ type: 'rejected', designId, batchId, payload: { reason } });
  }
}
