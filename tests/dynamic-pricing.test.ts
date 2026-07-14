import { describe, it, expect } from 'vitest';
import { applyDynamicPricing } from '@/lib/publish/dynamic-pricing';

// Master with a size-upcharge curve: S/M $28.99, larger sizes more.
const master = [
  { id: 1, price: 2899, title: 'S' },
  { id: 2, price: 2899, title: 'M' },
  { id: 3, price: 3199, title: '2XL' },
  { id: 4, price: 3499, title: '3XL' },
] as never;

describe('applyDynamicPricing', () => {
  it('lowers the base BELOW the master minimum (the shipped-$28.99 bug)', () => {
    const out = applyDynamicPricing(master, 1699);
    const prices = out.map((v) => v.price);
    // lowest variant must equal the requested base, not clamp to master's 2899
    expect(Math.min(...prices)).toBe(1699);
    // upcharge curve preserved: +300 and +600 above the S/M base
    expect(prices).toEqual([1699, 1699, 1999, 2299]);
  });

  it('raises the base above the master minimum', () => {
    const out = applyDynamicPricing(master, 3299);
    expect(out.map((v) => v.price)).toEqual([3299, 3299, 3599, 3899]);
  });

  it('never drops a variant below the intended base', () => {
    const out = applyDynamicPricing(master, 1499);
    expect(Math.min(...out.map((v) => v.price))).toBeGreaterThanOrEqual(1499);
  });

  it('passes master prices through unchanged when base is null', () => {
    const out = applyDynamicPricing(master, null);
    expect(out).toEqual(master);
  });
});
