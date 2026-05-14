import { geminiJSON, MODEL } from './gemini';
import { listingCopySchema, type ListingCopy } from '@/lib/etsy/validators';

export type DraftResult = ListingCopy & { source: 'gemini' | 'groq' | 'fallback' };

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

const TITLE_BANNED = /[<>{}\[\]|™®©]/g;

const PAD_TAGS = [
  'funny tee', 'gift', 't shirt', 'cute shirt', 'unisex tee', 'soft tee',
  'graphic tee', 'mens gift', 'womens gift', 'birthday gift', 'humor shirt',
  'gift idea', 'tee shirt',
];

// Clean Gemini's tags so they meet Etsy's strict requirements:
// - lowercase letters, digits, spaces only
// - 1-20 chars
// - exactly 13 unique entries
// Drift between "what Gemini returns" and "what Etsy accepts" used to silently
// fall back the whole modal to a generic draft. Now we accept Gemini's intent
// (the words and keywords) and just clean up the formatting.
export function sanitizeTags(raw: unknown, slogan: string): string[] {
  const input = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const t of input) {
    if (typeof t !== 'string') continue;
    const cleaned = t
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    if (cleaned.length === 0) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length === 13) return out;
  }

  // Pad up to 13 with slogan words + PAD_TAGS, deduped.
  const sloganWords = slogan
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 20);
  for (const candidate of [...sloganWords, ...PAD_TAGS]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length === 13) break;
  }
  // Last-resort filler (won't normally hit this).
  let i = 0;
  while (out.length < 13) {
    const filler = `tee ${++i}`;
    if (!seen.has(filler)) {
      seen.add(filler);
      out.push(filler);
    }
  }
  return out;
}

export function sanitizeTitle(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(TITLE_BANNED, '').replace(/&/g, 'and').slice(0, 140).trim();
}

export function sanitizeDescription(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.slice(0, 13000);
}

export async function draftListingCopy(input: { slogan: string }): Promise<DraftResult> {
  try {
    const { parsed, provider } = await geminiJSON<{ title?: unknown; tags?: unknown; description?: unknown }>({
      system: SYSTEM,
      user: `Slogan: ${input.slogan}`,
      model: MODEL,
      maxTokens: 2048,
    });

    // Sanitize Gemini's intent into Etsy-valid shapes BEFORE schema check.
    // This recovers from common drift (long tags, & in titles, occasional 12
    // or 14 tag arrays) without throwing away the whole draft.
    const cleaned = {
      title: sanitizeTitle(parsed?.title),
      tags: sanitizeTags(parsed?.tags, input.slogan),
      description: sanitizeDescription(parsed?.description),
    };

    const validated = listingCopySchema.safeParse(cleaned);
    if (validated.success) {
      return { ...validated.data, source: provider ?? 'gemini' };
    }
  } catch {
    /* fallthrough to fallback */
  }
  return { ...fallbackDraft(input.slogan), source: 'fallback' };
}

export function fallbackDraft(slogan: string): ListingCopy {
  const cleanSlogan = slogan.trim();
  const title = `${cleanSlogan} Funny T-Shirt Gift`.slice(0, 140);

  const tags = sanitizeTags([], cleanSlogan);

  const description = `${cleanSlogan} — a comfortable unisex tee printed on Bella+Canvas 3001. Made just for you. Available in multiple colors and sizes. Perfect gift for anyone who appreciates a good shirt.`;

  return { title, tags, description };
}
