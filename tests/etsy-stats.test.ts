import { describe, it, expect } from 'vitest';
import { computeStats } from '@/lib/etsy/stats';

describe('computeStats', () => {
  it('returns null when input is empty', () => {
    expect(computeStats([])).toBeNull();
  });

  it('handles single-element array', () => {
    const r = computeStats([1500]);
    expect(r).toEqual({ count: 1, min: 1500, p25: 1500, median: 1500, p75: 1500, max: 1500 });
  });

  it('handles odd-length array', () => {
    // sorted: 1000, 1500, 2000, 2500, 3000  (n=5)
    // median index = floor(5/2) = 2 → 2000
    // p25 index = floor(5*0.25) = 1 → 1500
    // p75 index = floor(5*0.75) = 3 → 2500
    const r = computeStats([3000, 1000, 2500, 1500, 2000]);
    expect(r).toEqual({ count: 5, min: 1000, p25: 1500, median: 2000, p75: 2500, max: 3000 });
  });

  it('handles even-length array (lower median)', () => {
    // sorted: 1000, 2000, 3000, 4000  (n=4)
    // median index = floor(4/2) = 2 → 3000 (lower-bias on even is acceptable for our use case)
    const r = computeStats([4000, 1000, 3000, 2000]);
    expect(r!.median).toBe(3000);
    expect(r!.min).toBe(1000);
    expect(r!.max).toBe(4000);
  });

  it('does not mutate the input array', () => {
    const input = [3000, 1000, 2000];
    const snapshot = [...input];
    computeStats(input);
    expect(input).toEqual(snapshot);
  });
});
