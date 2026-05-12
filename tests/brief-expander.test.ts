import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  claudeJSON: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { claudeJSON } from '@/lib/ai/claude';
import { expandBrief } from '@/lib/ai/brief-expander';

describe('expandBrief', () => {
  it('returns N concepts matching requested styles', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '...',
      parsed: {
        concepts: [
          { style: 'typography', headline: 'Born to Run', illustration_prompt: 'n/a',
            palette: ['#111111', '#eeeeee'], mood: 'bold', niche_keywords: ['running'] },
          { style: 'illustration', headline: 'Morning Miles', illustration_prompt: 'A runner at sunrise',
            palette: ['#ff9900', '#222222', '#ffffff'], mood: 'energetic', niche_keywords: ['running', 'sunrise'] },
        ],
      },
    });

    const out = await expandBrief({
      prompt: 'running motivation',
      styles: ['typography', 'illustration'],
      count: 2,
    });

    expect(out).toHaveLength(2);
    expect(out[0].style).toBe('typography');
    expect(out[1].style).toBe('illustration');
  });

  it('throws on schema mismatch', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '...',
      parsed: { concepts: [{ style: 'unknown', headline: '', illustration_prompt: '', palette: [], mood: '', niche_keywords: [] }] },
    });
    await expect(expandBrief({ prompt: 'x', styles: ['typography'], count: 1 }))
      .rejects.toThrow();
  });
});
