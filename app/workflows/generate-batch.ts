import {
  loadBatchStep,
  checkCapsStep,
  markBatchFailedStep,
  expandBriefStep,
  insertDesignRowsStep,
  markBatchReadyStep,
  generateOneDesignStep,
} from './steps';
import type { Concept, DesignStyle } from '@/lib/schemas';

export async function generateBatch(batchId: string) {
  'use workflow';

  const batch = await loadBatchStep(batchId);

  const caps = await checkCapsStep(batch.requestedCount);
  if (!caps.ok) {
    await markBatchFailedStep(batchId, caps.reason);
    return { ok: false, reason: caps.reason };
  }

  const concepts = await expandBriefStep(
    batch.prompt,
    batch.styles as DesignStyle[],
    batch.requestedCount,
  );

  const designRows = await insertDesignRowsStep(batchId, concepts);

  const concurrency = 5;
  for (let i = 0; i < designRows.length; i += concurrency) {
    const slice = designRows.slice(i, i + concurrency);
    await Promise.all(slice.map((d) =>
      generateOneDesignStep(d.id, d.concept as Concept, batchId)
    ));
  }

  await markBatchReadyStep(batchId);
  return { ok: true, count: designRows.length };
}
