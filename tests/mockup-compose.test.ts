import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

// Mock the catalog boundary so fetchConfiguredTones is testable without network.
vi.mock('@/lib/printify/catalog', () => ({
  fetchBlueprintVariants: vi.fn(),
}));

import { compose, selectScenes, SCENES, type Scene } from '@/lib/mockups/custom-mockup';
import { colorToTone, fetchConfiguredTones } from '@/lib/printify/variant-colors';
import { fetchBlueprintVariants } from '@/lib/printify/catalog';

const lightScene: Scene = {
  name: 'test-light',
  prompt: 't',
  printArea: { x: 100, y: 100, w: 300, h: 300 },
  shirtTone: 'light',
  altText: 't',
};
const darkScene: Scene = { ...lightScene, name: 'test-dark', shirtTone: 'dark' };

async function syntheticBase(color: { r: number; g: number; b: number }) {
  return sharp({ create: { width: 800, height: 800, channels: 3, background: color } })
    .png()
    .toBuffer();
}

async function syntheticDesign() {
  return sharp({ create: { width: 200, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe('compose', () => {
  it('returns a JPEG buffer matching the base dimensions', async () => {
    const out = await compose({
      baseBuffer: await syntheticBase({ r: 250, g: 250, b: 250 }),
      designBuffer: await syntheticDesign(),
      scene: lightScene,
    });
    expect(out).toBeInstanceOf(Buffer);
    expect(out.slice(0, 3).toString('hex')).toBe('ffd8ff'); // JPEG magic
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it('produces different output for light (multiply) vs dark (inverted over) tones', async () => {
    const design = await syntheticDesign();
    const base = await syntheticBase({ r: 128, g: 128, b: 128 });
    const outLight = await compose({ baseBuffer: base, designBuffer: design, scene: lightScene });
    const outDark = await compose({ baseBuffer: base, designBuffer: design, scene: darkScene });
    expect(Buffer.compare(outLight, outDark)).not.toBe(0);
  });
});

describe('selectScenes', () => {
  it('defaults to light scenes when tones are unknown/empty', () => {
    expect(selectScenes(undefined).every((s) => s.shirtTone === 'light')).toBe(true);
    expect(selectScenes(new Set()).every((s) => s.shirtTone === 'light')).toBe(true);
  });

  it('returns all-dark scenes for a dark-only seller', () => {
    const scenes = selectScenes(new Set(['dark'] as const));
    expect(scenes).toHaveLength(3);
    expect(scenes.every((s) => s.shirtTone === 'dark')).toBe(true);
  });

  it('returns light scenes for a light-only seller', () => {
    const scenes = selectScenes(new Set(['light'] as const));
    expect(scenes.every((s) => s.shirtTone === 'light')).toBe(true);
  });

  it('returns a light/dark mix when the seller offers both', () => {
    const scenes = selectScenes(new Set(['light', 'dark'] as const));
    expect(scenes.some((s) => s.shirtTone === 'light')).toBe(true);
    expect(scenes.some((s) => s.shirtTone === 'dark')).toBe(true);
  });

  it('only ever returns scenes from the SCENES catalog', () => {
    for (const s of selectScenes(new Set(['light', 'dark'] as const))) {
      expect(SCENES).toContain(s);
    }
  });
});

describe('colorToTone', () => {
  it('classifies dark colors', () => {
    for (const c of ['Black', 'Navy', 'Heather Forest', 'Maroon', 'Dark Chocolate']) {
      expect(colorToTone(c)).toBe('dark');
    }
  });
  it('classifies light/unknown colors as light', () => {
    for (const c of ['White', 'Athletic Heather', 'Natural', 'Ash', '']) {
      expect(colorToTone(c)).toBe('light');
    }
  });
});

describe('fetchConfiguredTones', () => {
  beforeEach(() => vi.mocked(fetchBlueprintVariants).mockReset());

  it('maps configured variant ids to their tones', async () => {
    vi.mocked(fetchBlueprintVariants).mockResolvedValue([
      { id: 1, title: 'Black / S', color: 'Black', size: 'S' },
      { id: 2, title: 'White / S', color: 'White', size: 'S' },
      { id: 3, title: 'Navy / M', color: 'Navy', size: 'M' },
    ]);
    const tones = await fetchConfiguredTones({ blueprintId: 6, providerId: 1, variantIds: [1, 2] });
    expect([...tones].sort()).toEqual(['dark', 'light']);
  });

  it('ignores variant ids with no catalog match (caller falls back to light)', async () => {
    vi.mocked(fetchBlueprintVariants).mockResolvedValue([
      { id: 99, title: 'Black / S', color: 'Black', size: 'S' },
    ]);
    const tones = await fetchConfiguredTones({ blueprintId: 6, providerId: 1, variantIds: [1, 2] });
    expect(tones.size).toBe(0);
  });

  it('returns an empty set when no variant ids are configured', async () => {
    const tones = await fetchConfiguredTones({ blueprintId: 6, providerId: 1, variantIds: [] });
    expect(tones.size).toBe(0);
    expect(fetchBlueprintVariants).not.toHaveBeenCalled();
  });
});
