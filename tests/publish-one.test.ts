import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => {
  const listingsRow = { id: 'listing_1' };
  return {
    db: {
      query: {
        settings: { findFirst: vi.fn() },
        designs: { findFirst: vi.fn() },
        listings: { findFirst: vi.fn() },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [listingsRow]),
          onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => [listingsRow]) })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => [{ count: 0 }]) })) })),
    },
  };
});
vi.mock('@/lib/publish/publish-design', () => ({ runPublish: vi.fn() }));
vi.mock('@/lib/etsy/price-recommendation', () => ({ recommendPrice: vi.fn(async () => ({ source: 'unavailable', recommendedCents: 0 })) }));
vi.mock('@/lib/ai/content-safety', () => ({ checkSafety: vi.fn(async () => ({ flags: [] })) }));
vi.mock('@/lib/events', () => ({ logEvent: vi.fn(async () => undefined) }));

import { db } from '@/lib/db/client';
import { runPublish } from '@/lib/publish/publish-design';
import { publishOneDesign } from '@/lib/publish/publish-one';

const SETTINGS = { masterPrintifyProductId: 'master_1', killSwitchActive: false, dailyPublishCap: 30, priceOffsetCents: 100, minPriceFloorCents: 1499 };
const DESIGN = { id: 'd1', batchId: 'b1', imageBlobUrl: 'https://blob/x.png', concept: { headline: 'Talk Dogs To Me', niche_keywords: ['dog'] } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.query.settings.findFirst).mockResolvedValue(SETTINGS as never);
  vi.mocked(db.query.designs.findFirst).mockResolvedValue(DESIGN as never);
  vi.mocked(db.query.listings.findFirst).mockResolvedValue(undefined as never);
  vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{ count: 0 }] }) } as never);
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn(async () => [{ id: 'listing_1' }]),
      onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'listing_1' }]) })),
    })),
  } as never);
  vi.mocked(db.update).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) } as never);
});

describe('publishOneDesign', () => {
  it('returns live with listingId + etsy fields on a fast publish', async () => {
    vi.mocked(runPublish).mockResolvedValue({ status: 'live', printifyProductId: 'p1', etsyListingId: 'e1', etsyUrl: 'https://etsy/e1' } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: true, status: 'live', listingId: 'listing_1', etsyListingId: 'e1' });
  });

  it('returns publishing_slow (queued) when runPublish does not attach fast', async () => {
    vi.mocked(runPublish).mockResolvedValue({ status: 'publishing_slow', printifyProductId: 'p1' } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: true, status: 'publishing_slow', listingId: 'listing_1' });
  });

  it('returns capReached when the daily publish cap is hit', async () => {
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{ count: 30 }] }) } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: false, capReached: true });
  });

  it('blocks on safety flags unless overridden', async () => {
    const { checkSafety } = await import('@/lib/ai/content-safety');
    vi.mocked(checkSafety).mockResolvedValueOnce({ flags: ['trademark'] } as never);
    const r = await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('blocked') });
  });

  it('reuses an existing printifyProductId (idempotent retry — no re-clone)', async () => {
    vi.mocked(db.query.listings.findFirst).mockResolvedValue({ id: 'listing_1', printifyProductId: 'p_existing', status: 'publishing' } as never);
    vi.mocked(runPublish).mockResolvedValue({ status: 'publishing_slow', printifyProductId: 'p_existing' } as never);
    await publishOneDesign('d1', { title: 'T', description: 'D', tags: ['a'] }, { resume: true });
    expect(vi.mocked(runPublish).mock.calls[0][0]).toMatchObject({ preCreatedProductId: 'p_existing' });
  });
});
