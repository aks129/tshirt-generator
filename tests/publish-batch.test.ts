// tests/publish-batch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { publishApprovedDesigns, type PublishBatchDeps } from '@/lib/publish/publish-batch';

const copy = { title: 't', tags: [], description: 'd' };

function deps(over: Partial<PublishBatchDeps> = {}): PublishBatchDeps {
  return {
    draft: vi.fn(async () => ({ ok: true, draft: copy })),
    publish: vi.fn(async () => ({ ok: true, status: 'live' as const, listingId: 'L1' })),
    uploadPhotos: vi.fn(async () => ({ ok: true })),
    onProgress: vi.fn(),
    ...over,
  };
}

describe('publishApprovedDesigns', () => {
  it('publishes all and uploads photos on the happy path', async () => {
    const d = deps();
    const r = await publishApprovedDesigns(['a', 'b'], d);
    expect(r).toMatchObject({ published: 2, failed: 0, queued: 0, stoppedAtCap: false });
    expect(d.uploadPhotos).toHaveBeenCalledTimes(2);
  });

  it('continues past a draft failure', async () => {
    const draft = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'gemini down' })
      .mockResolvedValueOnce({ ok: true, draft: copy });
    const r = await publishApprovedDesigns(['a', 'b'], deps({ draft }));
    expect(r).toMatchObject({ published: 1, failed: 1 });
  });

  it('stops and skips the rest when the cap is reached', async () => {
    const publish = vi.fn(async () => ({ ok: false, capReached: true }));
    const r = await publishApprovedDesigns(['a', 'b', 'c'], deps({ publish }));
    expect(r).toMatchObject({ published: 0, skipped: 3, stoppedAtCap: true });
  });

  it('marks slow publishes as queued and does NOT upload photos', async () => {
    const publish = vi.fn(async () => ({ ok: true, status: 'publishing_slow' as const }));
    const up = vi.fn(async () => ({ ok: true }));
    const r = await publishApprovedDesigns(['a'], deps({ publish, uploadPhotos: up }));
    expect(r).toMatchObject({ queued: 1, published: 0 });
    expect(up).not.toHaveBeenCalled();
  });

  it('counts a live listing as published even if photo upload fails', async () => {
    const up = vi.fn(async () => ({ ok: false, error: 'etsy 500' }));
    const r = await publishApprovedDesigns(['a'], deps({ uploadPhotos: up }));
    expect(r).toMatchObject({ published: 1, failed: 0 });
  });
});
