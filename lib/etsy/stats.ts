export type PriceStats = {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
};

export function computeStats(prices: number[]): PriceStats | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    min: sorted[0],
    p25: sorted[Math.floor(n * 0.25)],
    median: sorted[Math.floor(n / 2)],
    p75: sorted[Math.floor(n * 0.75)],
    max: sorted[n - 1],
  };
}
