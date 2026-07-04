// Pure ranking over listing_stats snapshots: latest vs oldest snapshot per
// listing (the caller decides the window by which rows it passes in). Rank by
// Δviews — "what's gaining attention" — not lifetime totals, so new winners
// surface immediately.

export type StatSnapshot = {
  listingId: string;
  views: number;
  favorers: number;
  capturedAt: Date;
};

export type ListingPerformance = {
  listingId: string;
  /** Latest snapshot values. */
  views: number;
  favorers: number;
  /** Latest minus oldest snapshot in the provided window. A listing with a
   *  single snapshot uses its totals as the delta (bootstrap fallback). */
  deltaViews: number;
  deltaFavorers: number;
};

export function rankListingPerformance(
  snapshots: StatSnapshot[],
  opts: { top?: number } = {},
): ListingPerformance[] {
  const byListing = new Map<string, StatSnapshot[]>();
  for (const s of snapshots) {
    const list = byListing.get(s.listingId) ?? [];
    list.push(s);
    byListing.set(s.listingId, list);
  }

  const perf: ListingPerformance[] = [];
  for (const [listingId, list] of byListing) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const oldest = list[0];
    const latest = list[list.length - 1];
    const single = list.length === 1;
    perf.push({
      listingId,
      views: latest.views,
      favorers: latest.favorers,
      deltaViews: single ? latest.views : latest.views - oldest.views,
      deltaFavorers: single ? latest.favorers : latest.favorers - oldest.favorers,
    });
  }

  perf.sort(
    (a, b) =>
      b.deltaViews - a.deltaViews ||
      b.deltaFavorers - a.deltaFavorers ||
      b.views - a.views,
  );

  return typeof opts.top === 'number' ? perf.slice(0, opts.top) : perf;
}
