import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import path from 'path';
import { composeMockup } from '@/lib/images/mockup';

describe('composeMockup', () => {
  it('overlays design onto the tee template at the correct dimensions', async () => {
    const design = await sharp({
      create: { width: 4500, height: 5400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const out = await composeMockup(design);
    const meta = await sharp(out).metadata();
    const tplMeta = await sharp(
      path.join(process.cwd(), 'public', 'tee-templates', 'bella-canvas-3001-white.png'),
    ).metadata();
    expect(meta.format).toBe('png');
    // Output matches template dimensions — no longer assumes a fixed 1500×1500
    // since the print area is now computed dynamically from template metadata.
    expect(meta.width).toBe(tplMeta.width);
    expect(meta.height).toBe(tplMeta.height);
  });
});
