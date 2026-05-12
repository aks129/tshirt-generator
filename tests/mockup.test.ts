import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeMockup } from '@/lib/images/mockup';

describe('composeMockup', () => {
  it('overlays design onto the tee template', async () => {
    const design = await sharp({ create: { width: 4500, height: 5400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const out = await composeMockup(design);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1500);
    expect(meta.height).toBe(1500);
  });
});
