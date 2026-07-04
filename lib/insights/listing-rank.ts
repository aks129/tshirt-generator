// Pure ranking over listing_stats snapshots: latest vs oldest snapshot per
// listing (the caller decides the window by which rows it passes in). Sales
// gained ranks first when available (money beats attention), then Δviews so
// new winners surface immediately, never lifetime totals.

export type StatSnapshot = {
  listingId: string;
  views: number;
  favorers: number;
  /** Cumulative units sold, or null when unknown (transactions_r scope not
   *  granted at capture time). */
  sales?: number | null;
  capturedAt: Date;
};

export type ListingPerformance = {
  listingId: string;
  /** Latest snapshot values. */
  views: number;
  favorers: number;
  sales: number | null;
  /** Latest minus oldest snapshot in the provided window. A listing with a
   *  single snapshot uses its totals as the delta (bootstrap fallback). */
  deltaViews: number;
  deltaFavorers: number;
  deltaSales: number | null;
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
    const salesKnown = typeof latest.sales === 'number';
    perf.push({
      listingId,
      views: latest.views,
      favorers: latest.favorers,
      sales: salesKnown ? (latest.sales as number) : null,
      deltaViews: single ? latest.views : latest.views - oldest.views,
      deltaFavorers: single ? latest.favorers : latest.favorers - oldest.favorers,
      deltaSales: !salesKnown
        ? null
        : single || typeof oldest.sales !== 'number'
          ? (latest.sales as number)
          : (latest.sales as number) - oldest.sales,
    });
  }

  perf.sort(
    (a, b) =>
      (b.deltaSales ?? 0) - (a.deltaSales ?? 0) ||
      b.deltaViews - a.deltaViews ||
      b.deltaFavorers - a.deltaFavorers ||
      b.views - a.views,
  );

  return typeof opts.top === 'number' ? perf.slice(0, opts.top) : perf;
}
