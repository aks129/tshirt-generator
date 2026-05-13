import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/gemini', () => ({
  geminiText: vi.fn(),
  MODEL: 'gemini-2.5-flash',
  MODEL_CREATIVE: 'gemini-2.5-pro',
}));

import { geminiText } from '@/lib/ai/gemini';
import { generateTypographySVG } from '@/lib/ai/svg-generator';

describe('generateTypographySVG', () => {
  it('returns SVG with viewBox 4500x5400 and the headline embedded', async () => {
    const fakeSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"><text x="2250" y="2700" text-anchor="middle" font-size="500" fill="#111">DAD JOKES ONLY</text></svg>`;
    vi.mocked(geminiText).mockResolvedValue('```svg\n' + fakeSVG + '\n```');

    const svg = await generateTypographySVG({
      headline: 'Dad Jokes Only',
      palette: ['#111111', '#ffffff'],
      mood: 'bold retro',
    });
    expect(svg).toContain('viewBox="0 0 4500 5400"');
    expect(svg).toContain('DAD JOKES ONLY');
  });
});
