import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  claudeJSON: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { claudeJSON } from '@/lib/ai/claude';
import { checkSafety } from '@/lib/ai/content-safety';

describe('checkSafety', () => {
  it('returns empty flags for clean content', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({ raw: '', parsed: { flags: [] } });
    const r = await checkSafety({ headline: 'Coffee First', illustrationPrompt: 'a mug of steaming coffee' });
    expect(r.flags).toEqual([]);
  });

  it('flags trademark content', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '', parsed: { flags: ['trademark'], rationale: 'mentions Nike' },
    });
    const r = await checkSafety({ headline: 'Just Do It', illustrationPrompt: 'a swoosh' });
    expect(r.flags).toContain('trademark');
  });
});
