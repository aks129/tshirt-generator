import { describe, it, expect } from 'vitest';
import { rasterizeSVG } from '@/lib/images/rasterize';

describe('rasterizeSVG', () => {
  it('produces a PNG buffer of the requested dimensions', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"><circle cx="2250" cy="2700" r="1000" fill="#ff0000"/></svg>`;
    const png = await rasterizeSVG(svg, { width: 4500, height: 5400 });
    expect(png).toBeInstanceOf(Buffer);
    expect(png.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
