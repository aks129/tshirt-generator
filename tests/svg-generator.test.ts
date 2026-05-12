import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  getClaude: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { getClaude } from '@/lib/ai/claude';
import { generateTypographySVG } from '@/lib/ai/svg-generator';

describe('generateTypographySVG', () => {
  it('returns SVG with viewBox 4500x5400 and the headline embedded', async () => {
    const fakeSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"><text x="2250" y="2700" text-anchor="middle" font-size="500" fill="#111">DAD JOKES ONLY</text></svg>`;
    vi.mocked(getClaude).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '```svg\n' + fakeSVG + '\n```' }] }) },
    } as any);

    const svg = await generateTypographySVG({
      headline: 'Dad Jokes Only',
      palette: ['#111111', '#ffffff'],
      mood: 'bold retro',
    });
    expect(svg).toContain('viewBox="0 0 4500 5400"');
    expect(svg).toContain('DAD JOKES ONLY');
  });
});
