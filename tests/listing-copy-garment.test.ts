// tests/listing-copy-garment.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystem, fallbackDraft, DEFAULT_GARMENT } from '@/lib/ai/listing-copy';

describe('garment in copy', () => {
  it('buildSystem injects the given garment into paragraph 2', () => {
    const sys = buildSystem('Gildan 5000');
    expect(sys).toContain('Gildan 5000');
    expect(sys).not.toContain('Bella+Canvas 3001');
  });

  it('buildSystem uses the default garment when none is given via fallback', () => {
    expect(DEFAULT_GARMENT).toContain('Bella+Canvas 3001');
    expect(buildSystem(DEFAULT_GARMENT)).toContain('Bella+Canvas 3001');
  });

  it('fallbackDraft description uses the provided garment', () => {
    const d = fallbackDraft('Cat Mom Energy', 'Gildan 5000');
    expect(d.description).toContain('Gildan 5000');
  });

  it('fallbackDraft defaults the garment when omitted', () => {
    const d = fallbackDraft('Cat Mom Energy');
    expect(d.description).toContain('Bella+Canvas 3001');
  });
});
