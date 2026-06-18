import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { draftListingCopy } from '@/lib/ai/listing-copy';
import { getGarmentDescriptor } from '@/lib/printify/garment-descriptor';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { publishOneDesign, type PublishOneCopy } from '@/lib/publish/publish-one';
import { processListingPhotos } from '@/lib/mockups/process-listing';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export async function loadApprovedDesignIdsStep(batchId: string): Promise<string[]> {
  'use step';
  const rows = await db.select({ id: designs.id }).from(designs)
    .where(and(eq(designs.batchId, batchId), eq(designs.status, 'approved')))
    .orderBy(asc(designs.createdAt));
  return rows.map((r) => r.id);
}

export async function draftOneStep(designId: string): Promise<{ ok: boolean; copy?: PublishOneCopy; error?: string }> {
  'use step';
  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!design) return { ok: false, error: 'Design not found' };
  const concept = design.concept as Concept;

  let garment: string | null = null;
  try {
    const s = await db.query.settings.findFirst();
    if (s?.masterPrintifyProductId) {
      const master = await fetchMasterProduct(s.masterPrintifyProductId);
      garment = await getGarmentDescriptor(master.blueprintId);
    }
  } catch { /* garment is best-effort; copy falls back to its default */ }

  try {
    const draft = await draftListingCopy({ slogan: concept.headline, garment: garment ?? undefined });
    return { ok: true, copy: { title: draft.title, description: draft.description, tags: draft.tags } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function publishOneStep(designId: string, copy: PublishOneCopy) {
  'use step';
  return publishOneDesign(designId, copy, { resume: true });
}

export async function uploadPhotosStep(listingId: string): Promise<{ ok: boolean; error?: string }> {
  'use step';
  try {
    const r = await processListingPhotos(listingId);
    return { ok: r.ok, error: r.ok ? undefined : (r as { message?: string }).message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pauseStep(ms: number): Promise<void> {
  'use step';
  await new Promise((r) => setTimeout(r, ms));
}

export async function markBatchPublishedStep(batchId: string, summary: Record<string, number>) {
  'use step';
  await logEvent({ type: 'generated', batchId, payload: { kind: 'publish_batch_done', ...summary } });
}
