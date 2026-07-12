import { describe, it, expect } from 'vitest';
import { rasterizeSVG } from '@/lib/images/rasterize';
import { inkCoverage, assertNotBlank, MIN_INK_COVERAGE } from '@/lib/images/ink-coverage';

const textSVG = (family: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400">
  <text x="2250" y="2700" text-anchor="middle" font-family="${family}" font-size="600" fill="#111111">VAMOS</text>
</svg>`;

describe('rasterizeSVG bundled fonts', () => {
  it('renders <text> using a bundled font (Anton is not a system font)', async () => {
    const png = await rasterizeSVG(textSVG('Anton'), { width: 1125, height: 1350 });
    const coverage = await inkCoverage(png);
    expect(coverage).toBeGreaterThan(MIN_INK_COVERAGE);
  });

  it('renders every approved family with visible ink', async () => {
    for (const family of ['Archivo Black', 'Bebas Neue', 'Oswald', 'Lora', 'Courier Prime']) {
      const png = await rasterizeSVG(textSVG(family), { width: 1125, height: 1350 });
      const coverage = await inkCoverage(png);
      expect(coverage, family).toBeGreaterThan(MIN_INK_COVERAGE);
    }
  });
});

describe('assertNotBlank', () => {
  it('throws on an effectively empty design', async () => {
    const png = await rasterizeSVG(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"></svg>',
      { width: 1125, height: 1350 },
    );
    await expect(assertNotBlank(png, 'test')).rejects.toThrow(/blank/i);
  });

  it('passes a rendered design', async () => {
    const png = await rasterizeSVG(textSVG('Anton'), { width: 1125, height: 1350 });
    await expect(assertNotBlank(png, 'test')).resolves.toBeUndefined();
  });
});
