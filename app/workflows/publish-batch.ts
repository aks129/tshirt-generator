import {
  loadApprovedDesignIdsStep,
  draftOneStep,
  publishOneStep,
  uploadPhotosStep,
  pauseStep,
  markBatchPublishedStep,
} from './publish-steps';

// Gap between designs so Printify's publish queue (capped at 200/30min) is not
// flooded. Sequential by design — durability + pacing beat parallel throughput
// for a 20-100 item batch.
const PACE_MS = 5000;

export async function publishBatch(batchId: string) {
  'use workflow';

  const designIds = await loadApprovedDesignIdsStep(batchId);
  const summary = { published: 0, queued: 0, failed: 0, skipped: 0 };
  let stoppedAtCap = false;

  for (const designId of designIds) {
    if (stoppedAtCap) { summary.skipped++; continue; }

    const drafted = await draftOneStep(designId);
    if (!drafted.ok || !drafted.copy) { summary.failed++; continue; }

    const pub = await publishOneStep(designId, drafted.copy);
    if (pub.capReached) { stoppedAtCap = true; summary.skipped++; continue; }
    if (!pub.ok) { summary.failed++; continue; }
    if (pub.status === 'publishing_slow' || !pub.listingId) { summary.queued++; await pauseStep(PACE_MS); continue; }

    const photos = await uploadPhotosStep(pub.listingId);
    summary.published++; // live regardless of photo outcome (cron backfills)
    void photos;

    await pauseStep(PACE_MS);
  }

  await markBatchPublishedStep(batchId, summary);
  return { ok: true, ...summary };
}
