import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/gemini', () => ({
  geminiJSON: vi.fn(),
  MODEL: 'gemini-2.5-flash',
  MODEL_CREATIVE: 'gemini-2.5-pro',
}));

import { geminiJSON } from '@/lib/ai/gemini';
import { checkSafety } from '@/lib/ai/content-safety';

describe('checkSafety', () => {
  it('returns empty flags for clean content', async () => {
    vi.mocked(geminiJSON).mockResolvedValue({ raw: '', parsed: { flags: [] } });
    const r = await checkSafety({ headline: 'Coffee First', illustrationPrompt: 'a mug of steaming coffee' });
    expect(r.flags).toEqual([]);
  });

  it('flags trademark content', async () => {
    vi.mocked(geminiJSON).mockResolvedValue({
      raw: '', parsed: { flags: ['trademark'], rationale: 'mentions Nike' },
    });
    const r = await checkSafety({ headline: 'Just Do It', illustrationPrompt: 'a swoosh' });
    expect(r.flags).toContain('trademark');
  });
});
