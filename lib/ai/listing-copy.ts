import { geminiJSON, MODEL } from './gemini';
import { listingCopySchema, type ListingCopy } from '@/lib/etsy/validators';

export type DraftResult = ListingCopy & { source: 'gemini' | 'fallback' };

const SYSTEM = `You write Etsy-optimized listing copy for print-on-demand t-shirts.

CONSTRAINTS:
- title: 5-140 chars. Start with the slogan or its rephrase, then high-intent keywords (Funny T-Shirt, Gift, Cute, etc.). Front-load value words. No <>{}[]| or ™®© symbols.
- tags: EXACTLY 13. Each 1-20 chars. All lowercase, letters/numbers/spaces only — NO punctuation, emojis, symbols. Mix: 4-5 short (1-2 word) high-volume tags, 6-7 medium (2-3 word) niche tags, 1-2 long-tail (3-5 word) phrases.
- description: 20-13000 chars. 2-3 paragraphs:
  - Para 1: hook the slogan, call out who it's for
  - Para 2: 100% combed ring-spun cotton Bella+Canvas 3001, DTG print, runs true to size, unisex fit
  - Para 3: care + sizing chart pointer + gift-worthiness

Return JSON ONLY in this exact format:
{ "title": "...", "tags": ["...", "...", ...13 total], "description": "..." }

NO trademarks, NO celebrity names, NO copyrighted phrases.`;

export async function draftListingCopy(input: { slogan: string }): Promise<DraftResult> {
  try {
    const { parsed } = await geminiJSON<unknown>({
      system: SYSTEM,
      user: `Slogan: ${input.slogan}`,
      model: MODEL,
      maxTokens: 2048,
    });
    const validated = listingCopySchema.safeParse(parsed);
    if (validated.success) {
      return { ...validated.data, source: 'gemini' };
    }
  } catch {
    /* fallthrough to fallback */
  }
  return { ...fallbackDraft(input.slogan), source: 'fallback' };
}

export function fallbackDraft(slogan: string): ListingCopy {
  const cleanSlogan = slogan.trim();
  const title = `${cleanSlogan} Funny T-Shirt Gift`.slice(0, 140);

  const baseTags = ['funny tee', 'gift', 't shirt', 'cute shirt', 'unisex tee', 'soft tee',
                    'graphic tee', 'mens gift', 'womens gift', 'birthday gift'];
  const sloganTags = cleanSlogan
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 20);

  const tags = Array.from(new Set([...sloganTags, ...baseTags]))
    .map((t) => t.slice(0, 20))
    .slice(0, 13);
  while (tags.length < 13) tags.push(`tee ${tags.length}`);

  const description = `${cleanSlogan} — a comfortable unisex tee printed on Bella+Canvas 3001. Made just for you. Available in multiple colors and sizes. Perfect gift for anyone who appreciates a good shirt.`;

  return { title, tags, description };
}
