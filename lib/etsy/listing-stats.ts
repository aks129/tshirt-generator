// Per-listing performance stats from Etsy's PUBLIC getListing endpoint —
// `views` and `num_favorers` need no seller OAuth, just the app's API key
// (sent as "keystring:shared_secret", same auth as upload-to-etsy.ts).

export type EtsyListingStats = {
  views: number;
  favorers: number;
  /** Etsy listing state ('active', 'inactive', …) or 'removed' when the
   *  listing 404s (delisted/deleted). */
  state: string;
};

export async function fetchEtsyListingStats(etsyListingId: string): Promise<EtsyListingStats> {
  const apiKey = process.env.ETSY_API_KEY;
  const sharedSecret = process.env.ETSY_SHARED_SECRET;
  if (!apiKey || !sharedSecret) throw new Error('ETSY_API_KEY / ETSY_SHARED_SECRET not set');

  const resp = await fetch(`https://openapi.etsy.com/v3/application/listings/${etsyListingId}`, {
    headers: { 'x-api-key': `${apiKey}:${sharedSecret}` },
  });

  if (resp.status === 404) {
    // Delisted/removed on Etsy's side — report it rather than throwing so the
    // stats run records the disappearance and moves on.
    return { views: 0, favorers: 0, state: 'removed' };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Etsy getListing ${etsyListingId} failed: ${resp.status} — ${body.slice(0, 200)}`);
  }

  const j = (await resp.json()) as { state?: string; views?: number; num_favorers?: number };
  return {
    views: typeof j.views === 'number' ? j.views : 0,
    favorers: typeof j.num_favorers === 'number' ? j.num_favorers : 0,
    state: j.state ?? 'active',
  };
}
