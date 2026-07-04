import { describe, it, expect } from 'vitest';
import { rankListingPerformance } from '@/lib/insights/listing-rank';

const t = (d: string) => new Date(d);

describe('rankListingPerformance', () => {
  it('computes deltas from oldest→latest snapshot per listing and ranks by Δviews', () => {
    const ranked = rankListingPerformance([
      { listingId: 'a', views: 10, favorers: 1, capturedAt: t('2026-06-14') },
      { listingId: 'a', views: 50, favorers: 5, capturedAt: t('2026-06-20') },
      { listingId: 'b', views: 100, favorers: 2, capturedAt: t('2026-06-14') },
      { listingId: 'b', views: 110, favorers: 2, capturedAt: t('2026-06-20') },
    ]);
    expect(ranked.map((r) => r.listingId)).toEqual(['a', 'b']); // Δ40 beats Δ10
    expect(ranked[0]).toMatchObject({ views: 50, favorers: 5, deltaViews: 40, deltaFavorers: 4 });
    expect(ranked[1]).toMatchObject({ views: 110, deltaViews: 10, deltaFavorers: 0 });
  });

  it('falls back to total views as the delta when a listing has a single snapshot', () => {
    const ranked = rankListingPerformance([
      { listingId: 'new', views: 7, favorers: 0, capturedAt: t('2026-06-20') },
    ]);
    expect(ranked[0]).toMatchObject({ deltaViews: 7, deltaFavorers: 0 });
  });

  it('tie-breaks equal Δviews by Δfavorers, then total views', () => {
    const ranked = rankListingPerformance([
      { listingId: 'x', views: 20, favorers: 0, capturedAt: t('2026-06-14') },
      { listingId: 'x', views: 30, favorers: 3, capturedAt: t('2026-06-20') },
      { listingId: 'y', views: 90, favorers: 0, capturedAt: t('2026-06-14') },
      { listingId: 'y', views: 100, favorers: 0, capturedAt: t('2026-06-20') },
    ]);
    expect(ranked.map((r) => r.listingId)).toEqual(['x', 'y']); // both Δ10; x has Δfav 3
  });

  it('ranks by Δsales first when sales data is present (money beats attention)', () => {
    const ranked = rankListingPerformance([
      { listingId: 'eyeballs', views: 0, favorers: 0, sales: 0, capturedAt: t('2026-06-14') },
      { listingId: 'eyeballs', views: 500, favorers: 9, sales: 0, capturedAt: t('2026-06-20') },
      { listingId: 'seller', views: 10, favorers: 0, sales: 1, capturedAt: t('2026-06-14') },
      { listingId: 'seller', views: 30, favorers: 1, sales: 4, capturedAt: t('2026-06-20') },
    ]);
    expect(ranked.map((r) => r.listingId)).toEqual(['seller', 'eyeballs']);
    expect(ranked[0]).toMatchObject({ sales: 4, deltaSales: 3 });
    expect(ranked[1]).toMatchObject({ sales: 0, deltaSales: 0 });
  });

  it('reports sales as null when snapshots lack sales data (scope not granted)', () => {
    const ranked = rankListingPerformance([
      { listingId: 'a', views: 5, favorers: 0, sales: null, capturedAt: t('2026-06-20') },
    ]);
    expect(ranked[0].sales).toBeNull();
    expect(ranked[0].deltaSales).toBeNull();
  });

  it('respects the top-N option and handles empty input', () => {
    expect(rankListingPerformance([])).toEqual([]);
    const many = ['a', 'b', 'c'].map((id, i) => ({
      listingId: id, views: (i + 1) * 10, favorers: 0, capturedAt: t('2026-06-20'),
    }));
    expect(rankListingPerformance(many, { top: 2 })).toHaveLength(2);
  });
});
