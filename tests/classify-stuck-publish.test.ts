import { describe, it, expect } from 'vitest';
import { classifyStuckPublish } from '@/lib/publish/classify-stuck-publish';

const ONE_HOUR = 60 * 60 * 1000;

describe('classifyStuckPublish', () => {
  it('returns live when hasExternal is true, regardless of lock or age', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: true, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('live');
    expect(classifyStuckPublish({ isLocked: true,  hasExternal: true, ageMs: 30 * 60 * 1000, cutoffMs: ONE_HOUR })).toBe('live');
  });

  it('returns wait when isLocked is true and no external (Printify still processing)', () => {
    expect(classifyStuckPublish({ isLocked: true, hasExternal: false, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('wait');
  });

  it('returns failed when unlocked + no external + ageMs >= cutoffMs', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: ONE_HOUR,     cutoffMs: ONE_HOUR })).toBe('failed');
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: 2 * ONE_HOUR, cutoffMs: ONE_HOUR })).toBe('failed');
  });

  it('returns wait when unlocked + no external + ageMs < cutoffMs (too early to conclude)', () => {
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: ONE_HOUR - 1, cutoffMs: ONE_HOUR })).toBe('wait');
    expect(classifyStuckPublish({ isLocked: false, hasExternal: false, ageMs: 0,            cutoffMs: ONE_HOUR })).toBe('wait');
  });
});
