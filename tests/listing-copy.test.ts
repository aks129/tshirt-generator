import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/gemini', () => ({
  geminiJSON: vi.fn(),
  MODEL: 'gemini-2.5-flash',
  MODEL_CREATIVE: 'gemini-2.5-flash',
}));

import { geminiJSON } from '@/lib/ai/gemini';
import { draftListingCopy, fallbackDraft } from '@/lib/ai/listing-copy';

describe('draftListingCopy', () => {
  it('returns valid copy from Gemini', async () => {
    vi.mocked(geminiJSON).mockResolvedValueOnce({
      raw: '',
      parsed: {
        title: 'Coffee You Later Funny T-Shirt Gift',
        tags: ['coffee', 'funny tee', 'gift', 't shirt', 'caffeine', 'pun shirt', 'office gift',
               'morning person', 'coffee lover', 'sarcasm', 'cute', 'mom gift', 'dad gift'],
        description: 'A comfortable unisex tee printed on Bella+Canvas 3001 cotton. Made just for you.',
      },
    });
    const r = await draftListingCopy({ slogan: 'Coffee You Later!' });
    expect(r.source).toBe('gemini');
    expect(r.title).toContain('Coffee');
    expect(r.tags).toHaveLength(13);
  });

  it('falls back when Gemini throws', async () => {
    vi.mocked(geminiJSON).mockRejectedValueOnce(new Error('rate limit'));
    const r = await draftListingCopy({ slogan: 'Coffee You Later!' });
    expect(r.source).toBe('fallback');
    expect(r.title).toContain('Coffee You Later');
    expect(r.tags).toHaveLength(13);
    expect(r.description.length).toBeGreaterThanOrEqual(20);
  });

  it('falls back when Gemini returns invalid copy (schema mismatch)', async () => {
    vi.mocked(geminiJSON).mockResolvedValueOnce({
      raw: '',
      parsed: { title: 'x', tags: ['a'], description: 'too short' },
    });
    const r = await draftListingCopy({ slogan: 'Coffee You Later!' });
    expect(r.source).toBe('fallback');
  });
});

describe('fallbackDraft', () => {
  it('produces 13 valid tags from slogan words', () => {
    const r = fallbackDraft('Coffee You Later!');
    expect(r.tags).toHaveLength(13);
    r.tags.forEach((t) => expect(t.length).toBeLessThanOrEqual(20));
  });

  it('pads tags when slogan has few words', () => {
    const r = fallbackDraft('Feral');
    expect(r.tags).toHaveLength(13);
  });
});
