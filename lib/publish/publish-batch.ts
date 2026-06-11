// lib/publish/publish-batch.ts
import type { ListingCopy } from '@/lib/etsy/validators';

export type BatchItemStatus =
  | 'pending' | 'drafting' | 'publishing' | 'photos' | 'live' | 'queued' | 'failed' | 'skipped';

export type BatchProgressEvent = { designId: string; status: BatchItemStatus; error?: string };

export type PublishBatchDeps = {
  draft: (designId: string) => Promise<{ ok: boolean; draft?: ListingCopy; error?: string }>;
  publish: (
    designId: string,
    copy: ListingCopy,
  ) => Promise<{
    ok: boolean;
    status?: 'live' | 'publishing_slow';
    listingId?: string;
    capReached?: boolean;
    error?: string;
  }>;
  uploadPhotos: (listingId: string) => Promise<{ ok: boolean; error?: string }>;
  onProgress: (e: BatchProgressEvent) => void;
};

export type PublishBatchResult = {
  published: number;
  queued: number;
  failed: number;
  skipped: number;
  stoppedAtCap: boolean;
};

// Sequentially draft → publish → photo-top-up each design. Reuses the same
// endpoints the publish modal uses, one at a time. Continues past per-design
// failures; stops cleanly when the server reports the daily publish cap.
export async function publishApprovedDesigns(
  designIds: string[],
  deps: PublishBatchDeps,
): Promise<PublishBatchResult> {
  const result: PublishBatchResult = { published: 0, queued: 0, failed: 0, skipped: 0, stoppedAtCap: false };

  for (const id of designIds) {
    if (result.stoppedAtCap) {
      deps.onProgress({ designId: id, status: 'skipped' });
      result.skipped++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'drafting' });
    const d = await deps.draft(id);
    if (!d.ok || !d.draft) {
      deps.onProgress({ designId: id, status: 'failed', error: d.error ?? 'draft failed' });
      result.failed++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'publishing' });
    const p = await deps.publish(id, d.draft);
    if (p.capReached) {
      result.stoppedAtCap = true;
      deps.onProgress({ designId: id, status: 'skipped', error: 'daily publish cap reached' });
      result.skipped++;
      continue;
    }
    if (!p.ok) {
      deps.onProgress({ designId: id, status: 'failed', error: p.error ?? 'publish failed' });
      result.failed++;
      continue;
    }
    if (p.status === 'publishing_slow' || !p.listingId) {
      deps.onProgress({ designId: id, status: 'queued' });
      result.queued++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'photos' });
    const ph = await deps.uploadPhotos(p.listingId);
    if (!ph.ok) {
      // Listing is live; only the extra photos failed (cron backfills). Count it.
      deps.onProgress({ designId: id, status: 'live', error: ph.error ?? 'photos pending (cron retries)' });
      result.published++;
      continue;
    }

    deps.onProgress({ designId: id, status: 'live' });
    result.published++;
  }

  return result;
}
