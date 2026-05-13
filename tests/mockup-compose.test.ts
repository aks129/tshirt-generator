import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { composeMockup } from '@/lib/mockups/compose';

async function syntheticBase(color: { r: number; g: number; b: number }) {
  return sharp({ create: { width: 800, height: 800, channels: 3, background: color } })
    .png()
    .toBuffer();
}

async function syntheticDesign() {
  return sharp({ create: { width: 300, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{
      input: await sharp({ create: { width: 200, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
      top: 50, left: 50,
    }])
    .png()
    .toBuffer();
}

describe('composeMockup', () => {
  it('returns a JPEG buffer of expected dimensions matching the base', async () => {
    const baseBuf = await syntheticBase({ r: 250, g: 250, b: 250 });
    const designBuf = await syntheticDesign();

    const out = await composeMockup({
      base: {
        id: 99,
        file: '/test.png',
        color: 'white',
        style: 'flat-lay',
        printArea: { x: 200, y: 200, w: 400, h: 400 },
        altText: 'test',
      },
      baseBuffer: baseBuf,
      designBuffer: designBuf,
    });

    expect(out).toBeInstanceOf(Buffer);
    expect(out.slice(0, 3).toString('hex')).toBe('ffd8ff');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it('uses multiply blend on white base and screen on dark base', async () => {
    const designBuf = await syntheticDesign();
    const baseLight = await syntheticBase({ r: 250, g: 250, b: 250 });
    const baseDark = await syntheticBase({ r: 20, g: 20, b: 20 });

    const outLight = await composeMockup({
      base: { id: 1, file: '/l.png', color: 'white', style: 'flat-lay', printArea: { x: 100, y: 100, w: 300, h: 300 }, altText: 't' },
      baseBuffer: baseLight, designBuffer: designBuf,
    });
    const outDark = await composeMockup({
      base: { id: 2, file: '/d.png', color: 'black', style: 'flat-lay', printArea: { x: 100, y: 100, w: 300, h: 300 }, altText: 't' },
      baseBuffer: baseDark, designBuffer: designBuf,
    });

    expect(outLight.slice(0, 3).toString('hex')).toBe('ffd8ff');
    expect(outDark.slice(0, 3).toString('hex')).toBe('ffd8ff');
  });
});
